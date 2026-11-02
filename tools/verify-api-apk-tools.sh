#!/bin/sh
set -eu

java_path="${SELFX_APK_JAVA_PATH:-/usr/bin/java}"
aapt_path="${SELFX_APK_AAPT_PATH:-/opt/android-sdk/build-tools/36.0.0/aapt}"
apksigner_jar_path="${SELFX_APK_SIGNER_JAR_PATH:-/opt/android-sdk/build-tools/36.0.0/lib/apksigner.jar}"

if [ ! -x "$java_path" ]; then
  echo "APK tool verification failed: Java is missing or not executable at $java_path" >&2
  exit 1
fi
if [ ! -x "$aapt_path" ]; then
  echo "APK tool verification failed: aapt is missing or not executable at $aapt_path" >&2
  exit 1
fi
if [ ! -r "$apksigner_jar_path" ]; then
  echo "APK tool verification failed: apksigner.jar is missing or unreadable at $apksigner_jar_path" >&2
  exit 1
fi

"$java_path" -version
"$aapt_path" version
unzip -tq "$apksigner_jar_path"
echo "APK inspection tools are present and ready."
