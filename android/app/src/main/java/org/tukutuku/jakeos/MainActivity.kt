package org.tukutuku.jakeos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import org.tukutuku.jakeos.data.JakeRepository
import org.tukutuku.jakeos.ui.JakeApp
import org.tukutuku.jakeos.ui.JakeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val repository = JakeRepository(applicationContext)
        setContent {
            JakeTheme {
                JakeApp(repository)
            }
        }
    }
}
