# Offline object-classification validation model

Model and labels are unchanged from the TensorFlow Authors' Flutter sample:

- Repository: https://github.com/tensorflow/flutter-tflite
- Pinned revision: `85fb92ecea445b1949da35b35b92b0792c29ddba`
- Model: https://github.com/tensorflow/flutter-tflite/blob/85fb92ecea445b1949da35b35b92b0792c29ddba/example/image_classification_mobilenet/assets/models/mobilenet_quant.tflite
- Labels: same directory, `labels.txt` (1001 lines, including background).
- License: repository Apache-2.0; full upstream license included as `LICENSE`.
  Commercial use and redistribution are permitted subject to its conditions.
- Attribution: Copyright 2023 The TensorFlow Authors. All Rights Reserved.

The pretrained quantized MobileNet classifies ordinary ImageNet objects. It
does not estimate customer attributes or drive product selection. No conversion,
training, credentials, runtime download or paid API is needed.

Verified directly from the downloaded FlatBuffer:

- Size: 4,287,874 bytes (about 4.09 MiB).
- SHA-256: `d3949e8a3556c79739cb675e0be7476503bcce76938031c6a1048e13e0cb7d8b`.
- Input: uint8 `[1,224,224,3]`, RGB; scale `0.0078125`, zero point `128`.
- Preprocessing: bake EXIF orientation, center square crop, bilinear resize;
  supply raw 0–255 RGB bytes without a second normalization step.
- Output: uint8 `[1,1001]`; scale `0.00390625`, zero point `0`.
- Dequantize output as `(value - zeroPoint) * scale`, then rank labels.

The sample is a runtime validation fixture, not a garment classifier. Classification
scores are not calibrated confidence. Real-image accuracy and performance must
be assessed separately on certified hardware.
