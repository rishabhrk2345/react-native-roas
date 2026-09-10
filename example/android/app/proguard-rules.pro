# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# react-native-config reads BuildConfig reflectively. Under R8 (minifyEnabled
# is on for release above) the class is stripped and every Config.<KEY> reads
# undefined — so a release build would silently go out UNSIGNED and pointed at
# no backend, which on the device looks identical to a working app.
-keep class com.roasrntest.BuildConfig { *; }
