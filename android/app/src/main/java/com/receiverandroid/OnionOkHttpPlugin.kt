package com.receiverandroid

import androidx.media3.datasource.DataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import com.brentvatne.common.api.Source
import com.brentvatne.exoplayer.RNVExoplayerPlugin
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.Dns
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ProxySelector
import java.net.SocketAddress
import java.net.URI
import java.util.concurrent.TimeUnit

/**
 * Routes ExoPlayer's HLS fetches (manifest + every segment) through a Tor SOCKS5 proxy so `.onion`
 * radio streams play. The load-bearing tricks:
 *  - SOCKS proxy at 127.0.0.1:<TorManager.socksPort> — the app's OWN embedded tor (E4). A ProxySelector
 *    reads the port dynamically + waits for bootstrap, so no Orbot / host tor / adb reverse is needed.
 *  - A custom Dns that fabricates an InetAddress carrying the ORIGINAL `.onion` hostname instead of
 *    resolving it locally — so OkHttp hands the name to the SOCKS proxy and Tor resolves it at the exit
 *    (effectively socks5h / remote DNS). Without this, `.onion` lookups fail "unresolved host".
 *  - A cookie interceptor supplying `cookieCheck=1`, which MediaMTX's onion HLS gate requires (else a 302
 *    loop → no audio), matching the desktop receiver's onion fix.
 *  - Generous timeouts because Tor circuits are slow, especially the first segment.
 */
class OnionOkHttpPlugin : RNVExoplayerPlugin {

    // Reads the embedded tor's SOCKS port at connection time, waiting up to ~45s for bootstrap on the
    // first play. ExoPlayer's loader runs on a background thread, so a bounded block here is fine.
    private val torProxySelector = object : ProxySelector() {
        override fun select(uri: URI?): MutableList<Proxy> {
            var port = TorManager.socksPort
            var waited = 0
            while (port == 0 && waited < 45_000) {
                Thread.sleep(200)
                waited += 200
                port = TorManager.socksPort
            }
            val p = if (port > 0) port else 9050 // fallback (e.g. host tor) if embed hasn't come up
            return mutableListOf(Proxy(Proxy.Type.SOCKS, InetSocketAddress.createUnresolved("127.0.0.1", p)))
        }
        override fun connectFailed(uri: URI?, sa: SocketAddress?, e: java.io.IOException?) {}
    }

    private val client: OkHttpClient by lazy {
        val onionDns = object : Dns {
            override fun lookup(hostname: String): List<InetAddress> =
                if (hostname.endsWith(".onion")) {
                    listOf(InetAddress.getByAddress(hostname, byteArrayOf(0, 0, 0, 0)))
                } else {
                    Dns.SYSTEM.lookup(hostname)
                }
        }
        // MediaMTX gates onion HLS with a `cookieCheck` cookie via a 302 loop. Use a CookieJar that both
        // seeds cookieCheck=1 AND captures any Set-Cookie the challenge issues, resending across the
        // redirect chain (what ffmpeg/a browser do). followRedirects stays on so the loop resolves.
        val jar = object : CookieJar {
            private val store = mutableMapOf<String, MutableList<Cookie>>()
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                store.getOrPut(url.host) { mutableListOf() }.apply {
                    removeAll { existing -> cookies.any { it.name == existing.name } }
                    addAll(cookies)
                }
            }
            override fun loadForRequest(url: HttpUrl): List<Cookie> {
                val seed = Cookie.Builder().name("cookieCheck").value("1").domain(url.host).path("/").build()
                val saved = store[url.host].orEmpty()
                return if (saved.any { it.name == "cookieCheck" }) saved else saved + seed
            }
        }
        OkHttpClient.Builder()
            .proxySelector(torProxySelector)
            .dns(onionDns)
            .cookieJar(jar)
            .followRedirects(true)
            .followSslRedirects(true)
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS) // live stream: no overall cap
            .retryOnConnectionFailure(true)
            .build()
    }

    override fun overrideMediaDataSourceFactory(
        source: Source,
        mediaDataSourceFactory: DataSource.Factory,
    ): DataSource.Factory {
        // This app plays Tor-hosted streams only, so route every fetch through the proxy.
        return OkHttpDataSource.Factory(client)
    }

    override fun onInstanceCreated(id: String, player: ExoPlayer) {}
    override fun onInstanceRemoved(id: String, player: ExoPlayer) {}
}
