import 'image_inference.dart';

/// Local analysis boundary. Future clothing recommendation adapters return
/// their own typed result, separate from object-model validation labels.
abstract class AcceptedPersonImageAnalysis {
  const AcceptedPersonImageAnalysis();
  bool get isAvailable;
}

/// Infrastructure validation only. Never map these labels to gender/audience.
class ObjectModelValidationAnalysis extends AcceptedPersonImageAnalysis {
  const ObjectModelValidationAnalysis(this.result);
  final ImageInferenceResult result;
  @override
  bool get isAvailable => result.isSuccess;
}

abstract interface class AcceptedPersonImageAnalyzer {
  Future<AcceptedPersonImageAnalysis> analyzeFile(String path);
  Future<void> dispose();
}

/// Reuses the existing service's lazy initialization and worker preprocessing.
class ObjectModelValidationAnalyzer implements AcceptedPersonImageAnalyzer {
  ObjectModelValidationAnalyzer(this.inference);
  final ImageInferenceService inference;
  @override
  Future<AcceptedPersonImageAnalysis> analyzeFile(String path) async =>
      ObjectModelValidationAnalysis(await inference.classifyFile(path));
  @override
  Future<void> dispose() => inference.dispose();
}
