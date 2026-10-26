# Jewellery Result Hand Model

`hand_landmarker.task` is the Google MediaPipe Hand Landmarker float16 model,
version 1. It is bundled for offline, on-device ring/bracelet preview framing.
No customer images or landmarks are sent to Google.

Source: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

SHA-256: fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1

Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker

The detector returns only temporary normalized hand bounds to Flutter. These
are not persisted. Comparable competing hands, unavailable detection, or a
target that cannot fit safely in a portrait crop leave the full result visible.
