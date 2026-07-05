package com.receiverandroid

import android.content.Context
import android.util.Log
import io.matthewnelson.kmp.tor.resource.exec.tor.ResourceLoaderTorExec
import io.matthewnelson.kmp.tor.runtime.Action.Companion.startDaemonAsync
import io.matthewnelson.kmp.tor.runtime.RuntimeEvent
import io.matthewnelson.kmp.tor.runtime.TorRuntime
import io.matthewnelson.kmp.tor.runtime.core.OnEvent
import io.matthewnelson.kmp.tor.runtime.core.config.TorOption
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File

/**
 * Embeds + starts Tor (kmp-tor 2.6.0, non-service exec path) on app launch and exposes the
 * auto-assigned local SOCKS port. OnionOkHttpPlugin proxies `.onion` HLS through 127.0.0.1:<socksPort>,
 * so the app carries its own Tor — no Orbot, no host tor, no `adb reverse` (E4).
 */
object TorManager {

    /** Resolved SOCKS port; 0 until the listener opens. Proxy is 127.0.0.1:<this>. */
    @Volatile
    var socksPort: Int = 0
        private set

    /** True once tor is bootstrapped + network-enabled (RuntimeEvent.READY). */
    @Volatile
    var isReady: Boolean = false
        private set

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Volatile
    private var runtime: TorRuntime? = null

    /** Idempotent — call once from Application.onCreate. Returns immediately; boots in the background. */
    fun start(context: Context) {
        if (runtime != null) return
        synchronized(this) {
            if (runtime != null) return
            val app = context.applicationContext
            val workDir = File(app.filesDir, "kmptor")
            val cacheDir = File(app.cacheDir, "kmptor")

            val environment = TorRuntime.Environment.Builder(
                workDirectory = workDir,
                cacheDirectory = cacheDir,
                loader = ResourceLoaderTorExec::getOrCreate,
            )

            val rt = TorRuntime.Builder(environment) {
                config {
                    // Always let tor pick a free SOCKS port — safest for an app.
                    TorOption.__SocksPort.configure { auto() }
                }
                // The SOCKS listener opens (and the port resolves) before full READY.
                observerStatic(RuntimeEvent.LISTENERS, OnEvent.Executor.Immediate) { listeners ->
                    socksPort = listeners.socks.firstOrNull()?.port?.value ?: 0
                    Log.i("TorManager", "SOCKS listener → 127.0.0.1:$socksPort")
                }
                observerStatic(RuntimeEvent.READY, OnEvent.Executor.Immediate) {
                    isReady = true
                    Log.i("TorManager", "tor READY (bootstrapped + network enabled)")
                }
                observerStatic(RuntimeEvent.ERROR, OnEvent.Executor.Immediate) { t ->
                    Log.e("TorManager", "tor error", t)
                }
            }
            runtime = rt

            scope.launch {
                try {
                    rt.startDaemonAsync()
                } catch (t: Throwable) {
                    Log.e("TorManager", "startDaemon failed", t)
                }
            }
        }
    }
}
