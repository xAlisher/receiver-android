package com.receiverandroid

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.brentvatne.react.ReactNativeVideoManager

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    // Embed + start Tor on launch; its auto SOCKS port feeds the video plugin (E4 — standalone, no Orbot).
    TorManager.start(this)
    // Route ExoPlayer HLS fetches through Tor SOCKS for .onion radio streams (E5).
    ReactNativeVideoManager.getInstance().registerPlugin(OnionOkHttpPlugin())
  }
}
