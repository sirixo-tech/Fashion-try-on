#!/bin/sh
set -eu

sh ./tools/verify-api-apk-tools.sh
exec npm run start --workspace=@selfx/api
