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
import java.util.concurrent.TimeUnit

/**
 * Routes ExoPlayer's HLS fetches (manifest + every segment) through a Tor SOCKS5 proxy so `.onion`
 * radio streams play. The load-bearing tricks:
 *  - SOCKS proxy at 127.0.0.1:<socksPort> (dev: the host's tor via `adb reverse tcp:9050 tcp:9050`;
 *    prod: an embedded tor's auto SOCKS port — see E4).
 *  - A custom Dns that fabricates an InetAddress carrying the ORIGINAL `.onion` hostname instead of
 *    resolving it locally — so OkHttp hands the name to the SOCKS proxy and Tor resolves it at the exit
 *    (effectively socks5h / remote DNS). Without this, `.onion` lookups fail "unresolved host".
 *  - A cookie interceptor supplying `cookieCheck=1`, which MediaMTX's onion HLS gate requires (else a 302
 *    loop → no audio), matching the desktop receiver's onion fix.
 *  - Generous timeouts because Tor circuits are slow, especially the first segment.
 */
class OnionOkHttpPlugin(private val socksPort: Int = 9050) : RNVExoplayerPlugin {

    private val client: OkHttpClient by lazy {
        val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress.createUnresolved("127.0.0.1", socksPort))
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
            .proxy(proxy)
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
