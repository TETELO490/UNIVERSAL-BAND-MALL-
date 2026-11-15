/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-16ad23c7'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "universal-band-logo.jpg",
    "revision": "8bd154d1bcd4335c6f4222665606ab19"
  }, {
    "url": "test-pwa.png",
    "revision": "ed5826f65b725d75e8d4012ab851099a"
  }, {
    "url": "test-launcher.png",
    "revision": "363744e6968e6f1226831d0cc45ecc3d"
  }, {
    "url": "test-foreground.png",
    "revision": "bd7d05b840aca30e611fc42975c36470"
  }, {
    "url": "test-clean-icon.png",
    "revision": "bd7d05b840aca30e611fc42975c36470"
  }, {
    "url": "store-mphela.jpg",
    "revision": "9bf4a094af2356875f85f497c0c9242d"
  }, {
    "url": "store-florence.jpg",
    "revision": "d6cbbbffeb4038dd7501a4064bc7378e"
  }, {
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "manifest.json",
    "revision": "590dc91fb12bff92e3d2c1a8b79fcdf0"
  }, {
    "url": "index.html",
    "revision": "4e8b2a55d36d62a4759b9d1336206e80"
  }, {
    "url": "icon-512.png",
    "revision": "f0422eb7857aacbcf4c388dbce3ed62f"
  }, {
    "url": "icon-192.png",
    "revision": "363744e6968e6f1226831d0cc45ecc3d"
  }, {
    "url": "favicon.ico",
    "revision": "bdd27811dff50fe34bf728ceab2c5a62"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "143d90454f2bda9f8d6e345570834123"
  }, {
    "url": "IMG-20261011-WA6339.jpg",
    "revision": "8bd154d1bcd4335c6f4222665606ab19"
  }, {
    "url": "assets/web-D8yVLqEq-v12.js",
    "revision": null
  }, {
    "url": "assets/web-Bvddp7wr-v12.js",
    "revision": null
  }, {
    "url": "assets/vendor-scanner-ClAn_TYh-v12.js",
    "revision": null
  }, {
    "url": "assets/vendor-react-BTp0svH--v12.js",
    "revision": null
  }, {
    "url": "assets/vendor-leaflet-Dq0p7ZGh-v12.js",
    "revision": null
  }, {
    "url": "assets/vendor-icons-DYv9Db5M-v12.js",
    "revision": null
  }, {
    "url": "assets/vendor-firebase-Cox8VJXc-v12.js",
    "revision": null
  }, {
    "url": "assets/rolldown-runtime-WkwZ5CU--v12.js",
    "revision": null
  }, {
    "url": "assets/index-b6IxX00q-v12.css",
    "revision": null
  }, {
    "url": "assets/index-D40TVySv-v12.js",
    "revision": null
  }, {
    "url": "assets/gpsHelper-5rxDXbVc-v12.js",
    "revision": null
  }, {
    "url": "assets/dist-CMedSjkm-v12.js",
    "revision": null
  }, {
    "url": "assets/customerDirectory-LZ4nZxl5-v12.js",
    "revision": null
  }, {
    "url": "assets/WalletPage-Do-0LnPc-v12.js",
    "revision": null
  }, {
    "url": "assets/WalletModal-Dcdyi77M-v12.js",
    "revision": null
  }, {
    "url": "assets/VerifyIdPage-FiDTBwJO-v12.js",
    "revision": null
  }, {
    "url": "assets/VendorPosScannerModal-B2EvPGrT-v12.js",
    "revision": null
  }, {
    "url": "assets/TicketsPage-1lX7Eoog-v12.js",
    "revision": null
  }, {
    "url": "assets/TicketQrScannerModal-CGF6ebr4-v12.js",
    "revision": null
  }, {
    "url": "assets/TicketHistoryModal-DChkK-EO-v12.js",
    "revision": null
  }, {
    "url": "assets/TicketDetailModal-vcgrJXXA-v12.js",
    "revision": null
  }, {
    "url": "assets/TermsPage-D0rgfO3s-v12.js",
    "revision": null
  }, {
    "url": "assets/TermsModal-BiValZAk-v12.js",
    "revision": null
  }, {
    "url": "assets/StoreRequestsModal-BqWO67TP-v12.js",
    "revision": null
  }, {
    "url": "assets/StoreManagerModal-CUhuBlQv-v12.js",
    "revision": null
  }, {
    "url": "assets/StoreDetailPage-C9KmW1fl-v12.js",
    "revision": null
  }, {
    "url": "assets/StoreCartDrawer-CvlOg4Na-v12.js",
    "revision": null
  }, {
    "url": "assets/StaffCheckInPage-COjJCNkk-v12.js",
    "revision": null
  }, {
    "url": "assets/SendPayshapRequestModal-BwCb9OuT-v12.js",
    "revision": null
  }, {
    "url": "assets/Security-DvRJpdwH-v12.js",
    "revision": null
  }, {
    "url": "assets/Scanner-CA7TdK-A-v12.js",
    "revision": null
  }, {
    "url": "assets/ResetPasswordOtpModal-BcDMIW9g-v12.js",
    "revision": null
  }, {
    "url": "assets/ReservedPage-h7y_Abgs-v12.js",
    "revision": null
  }, {
    "url": "assets/RegisterPage-DfA-QHTv-v12.js",
    "revision": null
  }, {
    "url": "assets/RefundPolicyPage-DiWhq2Wv-v12.js",
    "revision": null
  }, {
    "url": "assets/PromoterDashboardModal-CwicwBqm-v12.js",
    "revision": null
  }, {
    "url": "assets/ProfilePage-DzE06JkW-v12.js",
    "revision": null
  }, {
    "url": "assets/PrivacyPolicyPage-DLAO8fnP-v12.js",
    "revision": null
  }, {
    "url": "assets/PayshapTopUpPage-BrN-nU9W-v12.js",
    "revision": null
  }, {
    "url": "assets/NewPasswordModal-DKEQRsJz-v12.js",
    "revision": null
  }, {
    "url": "assets/MyStoresModal-ibR6O6sP-v12.js",
    "revision": null
  }, {
    "url": "assets/MealCustomizerModal-CNYJnuZK-v12.js",
    "revision": null
  }, {
    "url": "assets/LoginPage-DVEWL-Ds-v12.js",
    "revision": null
  }, {
    "url": "assets/HistoryPage-DSoRzz1E-v12.js",
    "revision": null
  }, {
    "url": "assets/FoodMenuPage-D8e1QYMk-v12.js",
    "revision": null
  }, {
    "url": "assets/FoodDrinksPage-BnPvk3oy-v12.js",
    "revision": null
  }, {
    "url": "assets/EveryCentPage-wc4vtqJG-v12.js",
    "revision": null
  }, {
    "url": "assets/EventFoodPreOrderModal-n9x_QroZ-v12.js",
    "revision": null
  }, {
    "url": "assets/DriverDashboardModal-rKbR06yH-v12.js",
    "revision": null
  }, {
    "url": "assets/DatePickerInput-5pt43gfU-v12.js",
    "revision": null
  }, {
    "url": "assets/CustomerSupportModal-C32IAz2T-v12.js",
    "revision": null
  }, {
    "url": "assets/CustomerProfileViewPage-xLYeue5G-v12.js",
    "revision": null
  }, {
    "url": "assets/ContactPage-Ir-xHbFB-v12.js",
    "revision": null
  }, {
    "url": "assets/CheckInPage-C4-zt5AZ-v12.js",
    "revision": null
  }, {
    "url": "assets/BuyTicketModal-xfF3arvx-v12.js",
    "revision": null
  }, {
    "url": "assets/AppLockSettingsModal-DxBwN2ru-v12.js",
    "revision": null
  }, {
    "url": "assets/AppLockPage-BZbEyp63-v12.js",
    "revision": null
  }, {
    "url": "assets/AppIconSettingsPage-8Qbog7DW-v12.js",
    "revision": null
  }, {
    "url": "assets/ApiSettingsPage-KyXZoJsT-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminWriteNfcPage-CXyG6ssW-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminVerificationsPage-D1Pez-ZM-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminSecurityModal-CqIy817M-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminPayshapSettingsPage-DeYukH66-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminLogoSettingsPage-B6IN4Bvn-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminLivePaymentsPage-BzWlm_dL-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminEventsPage-CdAQF_bx-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminConsoleModal-DZlWd0OH-v12.js",
    "revision": null
  }, {
    "url": "assets/AdminBinPage-Cuo74-Pn-v12.js",
    "revision": null
  }, {
    "url": "assets/AddEventModal-BUSp0esx-v12.js",
    "revision": null
  }, {
    "url": "assets/AboutPage-COHTkk_A-v12.js",
    "revision": null
  }, {
    "url": "assets/aistudio/google-services__7__94f383ee.json",
    "revision": null
  }, {
    "url": "assets/aistudio/google-services__6__8cd76c47.json",
    "revision": null
  }, {
    "url": "assets/aistudio/google-services__5__14f1d16b.json",
    "revision": null
  }, {
    "url": "assets/aistudio/google-services__1__731a1782.json",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261115_131633_Chrome_c28d1be4.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261115_130818_Chrome_cc7e91c0.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261115_125613_Chrome_5ec4a562.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261114_155339_Package_installer_2d5ef368.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261114_104056_Universal_Band_1daf7c5c.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261113_123629_Settings_b39627dc.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261113_123617_Permission_controller_4e7c775d.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261113_123504_Universal_Band_ce79775d.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261113_123252_Universal_Band_62c10a24.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_233032_Universal_Band_19a0fd83.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_232009_Chrome_895772d1.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_230705_Universal_Band_fa70440f.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_230626_Chrome_eac80d53.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_214749_Universal_Band_4bcec362.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_214559_Chrome_1dfeedd6.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_163931_Package_installer_31605d08.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_155829_Chrome_dc42bfc8.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_145359_Chrome_b16c3ad5.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_141009_Universal_Band_e9315d16.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_131008_Universal_Band_1818ceb9.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_130954_Google_Play_services_055ddda8.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_115508_Chrome_14890be1.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261112_080214_Chrome_cd4e76a3.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_221131_Chrome_515531ee.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_204620_Universal_Band_a1f9b287.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_170016_Chrome_ed035603.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_155711_Chrome_055c3ca9.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_145051_Package_installer_d11fe179.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_114239_Chrome_ae1a775a.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_113057_Chrome_dd8c26d9.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_111515_Chrome_67101daa.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_074152_Chrome_7ec9cbb6.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_072256_Chrome_0ee7cadc.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261111_072246_Chrome_8a1775c9.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261110_000918_Chrome_8e650457.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261110_000446_Chrome_11181e0a.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261109_233551_Chrome_ea6001cb.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261109_230103_Chrome_1deeeeb0.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261109_225251_Chrome_7a5e7672.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261109_224625_Chrome_8132e73e.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261025_074004_Chrome_5efd8a0a.jpg",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "143d90454f2bda9f8d6e345570834123"
  }, {
    "url": "favicon.ico",
    "revision": "bdd27811dff50fe34bf728ceab2c5a62"
  }, {
    "url": "icon-192.png",
    "revision": "363744e6968e6f1226831d0cc45ecc3d"
  }, {
    "url": "icon-512.png",
    "revision": "f0422eb7857aacbcf4c388dbce3ed62f"
  }, {
    "url": "manifest.json",
    "revision": "590dc91fb12bff92e3d2c1a8b79fcdf0"
  }, {
    "url": "universal-band-logo.jpg",
    "revision": "8bd154d1bcd4335c6f4222665606ab19"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/images\.unsplash\.com\/.*/i, new workbox.StaleWhileRevalidate({
    "cacheName": "unsplash-images-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 50,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
