import 'dart:io';
import 'dart:math' as math;

import 'package:opencv_dart/opencv_dart.dart' as cv;

import 'image_quality.dart';

class OpenCvKioskImageQualityAnalyzer implements KioskImageQualityAnalyzer {
  bool _disposed = false;

  @override
  Future<ImageQualityResult> analyzeStillImage(
    String imagePath,
    ImageQualityTarget target,
  ) async {
    if (_disposed) {
      return createUnavailableImageQualityResult();
    }

    cv.Mat? decoded;
    cv.Mat? analysisSource;
    cv.Mat? gray;
    cv.Mat? laplacian;
    cv.Scalar? grayMean;
    cv.Scalar? grayStddev;
    cv.Scalar? lapMean;
    cv.Scalar? lapStddev;

    try {
      final bytes = await File(imagePath).readAsBytes();
      decoded = cv.imdecode(bytes, cv.IMREAD_COLOR);
      if (decoded.isEmpty || decoded.width <= 0 || decoded.height <= 0) {
        return createInvalidImageQualityResult(
          ImageQualityIssueCode.imageDecodeFailed,
          'Captured image could not be decoded.',
        );
      }

      analysisSource = _downscaleForAnalysis(decoded);
      gray = cv.cvtColor(analysisSource, cv.COLOR_BGR2GRAY);
      laplacian = cv.laplacian(gray, cv.MatType.CV_64F, ksize: 3);
      (grayMean, grayStddev) = cv.meanStdDev(gray);
      (lapMean, lapStddev) = cv.meanStdDev(laplacian);

      final metrics = CompleteImageQualityMetrics(
        width: decoded.width,
        height: decoded.height,
        brightness: _round(grayMean.val1),
        contrast: _round(grayStddev.val1),
        sharpness: _round(math.pow(lapStddev.val1, 2).toDouble()),
      );
      return normalizeImageQualityResult(metrics, target);
    } on FileSystemException {
      return createInvalidImageQualityResult(
        ImageQualityIssueCode.imageInvalid,
        'Captured image file could not be read.',
      );
    } catch (_) {
      return createUnavailableImageQualityResult(
        width: decoded?.width,
        height: decoded?.height,
      );
    } finally {
      grayMean?.dispose();
      grayStddev?.dispose();
      lapMean?.dispose();
      lapStddev?.dispose();
      laplacian?.dispose();
      gray?.dispose();
      if (analysisSource != null && !identical(analysisSource, decoded)) {
        analysisSource.dispose();
      }
      decoded?.dispose();
    }
  }

  @override
  void dispose() {
    _disposed = true;
  }

  cv.Mat _downscaleForAnalysis(cv.Mat source) {
    const maxDimension = 640;
    final largestDimension = math.max(source.width, source.height);
    if (largestDimension <= maxDimension) {
      return source;
    }
    final scale = maxDimension / largestDimension;
    final width = math.max(1, (source.width * scale).round());
    final height = math.max(1, (source.height * scale).round());
    return cv.resize(source, (width, height));
  }

  double _round(double value) => (value * 100).round() / 100;
}
