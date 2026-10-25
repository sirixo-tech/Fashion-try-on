// Backward-compatible asset preparation entry point; never builds an APK.
const {
  generateAppIcons,
} = require("../../../tools/branding/prepare-app-icons.cjs");
generateAppIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
