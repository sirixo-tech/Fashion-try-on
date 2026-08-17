import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/live/person_analysis.dart';
import 'package:selfx_kiosk/src/tryon/model_coverage_analyzer.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';

void main() {
  test('serializes canonical model coverage values as uppercase API enums', () {
    expect(ModelCoverage.upperBody.apiValue, 'UPPER_BODY');
    expect(ModelCoverage.lowerBody.apiValue, 'LOWER_BODY');
    expect(ModelCoverage.fullBody.apiValue, 'FULL_BODY');
    expect(ModelCoverage.unknown.apiValue, 'UNKNOWN');
  });

  group('modelCoverageFromPersonObservation', () {
    test('classifies shoulder and hip visibility as upper body', () {
      final coverage = modelCoverageFromPersonObservation(
        personWith(const ['leftShoulder', 'rightHip']),
      );

      expect(coverage, ModelCoverage.upperBody);
    });

    test('does not require knees, lower legs or feet for upper body', () {
      final coverage = modelCoverageFromPersonObservation(
        personWith(const [
          'leftShoulder',
          'rightShoulder',
          'leftHip',
          'rightHip',
        ]),
      );

      expect(coverage, ModelCoverage.upperBody);
    });

    test('classifies complete landmark regions as full body', () {
      final coverage = modelCoverageFromPersonObservation(
        personWith(const [
          'leftShoulder',
          'rightHip',
          'leftKnee',
          'rightAnkle',
        ]),
      );

      expect(coverage, ModelCoverage.fullBody);
    });

    test('classifies lower-only landmark regions as lower body', () {
      final coverage = modelCoverageFromPersonObservation(
        personWith(const ['leftHip', 'rightKnee', 'leftFootIndex']),
      );

      expect(coverage, ModelCoverage.lowerBody);
    });

    test('returns unknown for insufficient landmarks', () {
      final coverage = modelCoverageFromPersonObservation(
        personWith(const ['leftShoulder']),
      );

      expect(coverage, ModelCoverage.unknown);
    });
  });
}

PersonObservation personWith(List<String> names) {
  return personObservationFromLandmarks([
    for (var index = 0; index < names.length; index++)
      LandmarkObservation(
        name: names[index],
        position: Offset(100 + index * 20, 100 + index * 24),
        confidence: 0.9,
      ),
  ]);
}
