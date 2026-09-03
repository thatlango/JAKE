-- Compatibility bridge while the current JakeOS UI still serializes tasks inside projects.tasks.
-- work_items remains canonical; these triggers keep the legacy JSON projection synchronized both ways.

CREATE OR REPLACE FUNCTION jakeos_project_tasks_to_work_items()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  task jsonb;
  task_json_id text;
  canonical_id text;
  done_flag boolean;
  current_ids text[] := ARRAY[]::text[];
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  FOR task IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.tasks, '[]'::jsonb))
  LOOP
    task_json_id := COALESCE(NULLIF(task->>'id',''), md5(COALESCE(task->>'text','')));
    canonical_id := CASE
      WHEN task_json_id LIKE 'wi_%' OR task_json_id LIKE 'legacy:%' THEN task_json_id
      ELSE 'legacy:' || NEW.id || ':' || task_json_id
    END;
    current_ids := array_append(current_ids, canonical_id);
    done_flag := COALESCE((task->>'done')::boolean, FALSE);

    INSERT INTO work_items(
      id, project_id, title, status, priority, source, source_ref, metadata,
      completed_at, created_at, updated_at, last_touched_at
    ) VALUES (
      canonical_id,
      NEW.id,
      COALESCE(NULLIF(task->>'text',''), '(Untitled task)'),
      CASE WHEN done_flag THEN 'done' ELSE 'ready' END,
      CASE lower(COALESCE(NEW.priority,'Medium'))
        WHEN 'critical' THEN 'critical'
        WHEN 'high' THEN 'high'
        WHEN 'low' THEN 'low'
        ELSE 'medium'
      END,
      CASE WHEN canonical_id LIKE 'legacy:%' THEN 'project-json' ELSE 'jakeos' END,
      CASE WHEN canonical_id LIKE 'legacy:%' THEN NEW.id || ':' || task_json_id ELSE NULL END,
      jsonb_build_object('project_json_id', task_json_id),
      CASE WHEN done_flag THEN NOW() ELSE NULL END,
      NOW(), NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      title = EXCLUDED.title,
      status = CASE
        WHEN done_flag THEN 'done'
        WHEN work_items.status = 'done' THEN 'ready'
        ELSE work_items.status
      END,
      completed_at = CASE
        WHEN done_flag THEN COALESCE(work_items.completed_at, NOW())
        ELSE NULL
      END,
      metadata = work_items.metadata || jsonb_build_object('project_json_id', task_json_id),
      updated_at = NOW(),
      last_touched_at = NOW(),
      version = work_items.version + 1;
  END LOOP;

  -- Only legacy JSON-origin tasks may be cancelled merely because they disappear from
  -- a browser's serialized project array. This prevents a stale JakeOS tab from
  -- cancelling a newer Momentum-origin task.
  IF COALESCE(array_length(current_ids, 1), 0) = 0 THEN
    UPDATE work_items
      SET status='cancelled', updated_at=NOW(), last_touched_at=NOW(), version=version+1
      WHERE project_id=NEW.id
        AND source='project-json'
        AND status <> 'cancelled';
  ELSE
    UPDATE work_items
      SET status='cancelled', updated_at=NOW(), last_touched_at=NOW(), version=version+1
      WHERE project_id=NEW.id
        AND source='project-json'
        AND NOT (id = ANY(current_ids))
        AND status <> 'cancelled';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_tasks_to_work_items ON projects;
CREATE TRIGGER trg_projects_tasks_to_work_items
AFTER INSERT OR UPDATE OF tasks ON projects
FOR EACH ROW EXECUTE FUNCTION jakeos_project_tasks_to_work_items();

CREATE OR REPLACE FUNCTION jakeos_work_item_to_project_tasks()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  json_id text;
  old_json_id text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  json_id := COALESCE(NULLIF(NEW.metadata->>'project_json_id',''), NEW.id);

  -- If a task moves between projects, remove its old JSON projection first.
  IF TG_OP='UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id AND OLD.project_id IS NOT NULL THEN
    old_json_id := COALESCE(NULLIF(OLD.metadata->>'project_json_id',''), OLD.id);
    UPDATE projects p SET
      tasks = COALESCE((
        SELECT jsonb_agg(elem ORDER BY ord)
        FROM jsonb_array_elements(COALESCE(p.tasks,'[]'::jsonb)) WITH ORDINALITY AS x(elem,ord)
        WHERE elem->>'id' <> old_json_id
      ), '[]'::jsonb),
      updated_at = NOW()
    WHERE p.id=OLD.project_id;
  END IF;

  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Remember the projection identifier without recursively resynchronizing.
  IF NOT (NEW.metadata ? 'project_json_id') THEN
    UPDATE work_items
      SET metadata = metadata || jsonb_build_object('project_json_id', json_id)
      WHERE id=NEW.id;
  END IF;

  UPDATE projects p SET
    tasks = CASE
      WHEN NEW.status='cancelled' THEN
        COALESCE((
          SELECT jsonb_agg(elem ORDER BY ord)
          FROM jsonb_array_elements(COALESCE(p.tasks,'[]'::jsonb)) WITH ORDINALITY AS x(elem,ord)
          WHERE elem->>'id' <> json_id
        ), '[]'::jsonb)
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p.tasks,'[]'::jsonb)) elem
        WHERE elem->>'id' = json_id
      ) THEN
        COALESCE((
          SELECT jsonb_agg(
            CASE WHEN elem->>'id'=json_id
              THEN elem || jsonb_build_object('text',NEW.title,'done',NEW.status='done')
              ELSE elem
            END ORDER BY ord
          )
          FROM jsonb_array_elements(COALESCE(p.tasks,'[]'::jsonb)) WITH ORDINALITY AS x(elem,ord)
        ), '[]'::jsonb)
      ELSE
        COALESCE(p.tasks,'[]'::jsonb) || jsonb_build_array(
          jsonb_build_object('id',json_id,'text',NEW.title,'done',NEW.status='done')
        )
    END,
    updated_at = NOW()
  WHERE p.id=NEW.project_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_item_insert_to_project_tasks ON work_items;
CREATE TRIGGER trg_work_item_insert_to_project_tasks
AFTER INSERT ON work_items
FOR EACH ROW EXECUTE FUNCTION jakeos_work_item_to_project_tasks();

DROP TRIGGER IF EXISTS trg_work_item_update_to_project_tasks ON work_items;
CREATE TRIGGER trg_work_item_update_to_project_tasks
AFTER UPDATE OF title, status, project_id ON work_items
FOR EACH ROW EXECUTE FUNCTION jakeos_work_item_to_project_tasks();

-- Backfill every existing JakeOS project task into work_items on first migration.
UPDATE projects SET tasks=tasks;
