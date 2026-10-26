enum PhotoAcquisitionPurpose { garment, model }

enum PhotoAcquisitionSource { kioskCamera, phone }

extension PhotoAcquisitionPurposeLabels on PhotoAcquisitionPurpose {
  String get apiValue {
    return switch (this) {
      PhotoAcquisitionPurpose.garment => 'GARMENT',
      PhotoAcquisitionPurpose.model => 'MODEL',
    };
  }

  String get uploadTitle {
    return switch (this) {
      PhotoAcquisitionPurpose.garment => 'Scan to add garment photo',
      PhotoAcquisitionPurpose.model => 'Scan to add your photo',
    };
  }

  String get readyTitle {
    return switch (this) {
      PhotoAcquisitionPurpose.garment => 'Garment photo received',
      PhotoAcquisitionPurpose.model => 'Photo received',
    };
  }

  String get waitingMessage {
    return switch (this) {
      PhotoAcquisitionPurpose.garment => 'Waiting for garment photo...',
      PhotoAcquisitionPurpose.model => 'Waiting for your photo...',
    };
  }
}

PhotoAcquisitionPurpose photoAcquisitionPurposeFromApi(String value) {
  return switch (value.toUpperCase()) {
    'GARMENT' => PhotoAcquisitionPurpose.garment,
    _ => PhotoAcquisitionPurpose.model,
  };
}
