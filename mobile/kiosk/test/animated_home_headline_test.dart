import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/idle/kiosk_idle_presentation.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/ui/animated_home_headline.dart';

void main() {
  testWidgets(
    'headline cycles phrases, holds three seconds, and keeps its size',
    (tester) async {
      await tester.pumpWidget(_page());
      final initial = tester.getRect(
        find.byKey(const Key('home-animated-headline')),
      );
      expect(_colours(tester), [
        SelfxKioskTokens.homeOrange,
        Colors.white,
        Colors.white,
      ]);
      expect(_scale(tester, 0), closeTo(1.05, 0.001));
      expect(_scale(tester, 1), 1);
      expect(_scale(tester, 2), 1);
      final phraseSizes = [
        for (var index = 0; index < 3; index++)
          tester.getSize(find.byKey(ValueKey('home-headline-scale-$index'))),
      ];
      await tester.pump(const Duration(milliseconds: 1500));
      await tester.pump(const Duration(milliseconds: 175));
      final mid = _colours(tester);
      expect(mid[0], isNot(SelfxKioskTokens.homeOrange));
      expect(mid[0], isNot(Colors.white));
      expect(mid[1], isNot(Colors.white));
      expect(_scale(tester, 0), allOf(greaterThan(1), lessThan(1.05)));
      expect(_scale(tester, 1), allOf(greaterThan(1), lessThan(1.05)));
      expect(_scale(tester, 2), 1);
      await tester.pump(const Duration(milliseconds: 175));
      expect(_colours(tester), [
        Colors.white,
        SelfxKioskTokens.homeOrange,
        Colors.white,
      ]);
      expect(_scale(tester, 0), 1);
      expect(_scale(tester, 1), closeTo(1.05, 0.001));
      await tester.pump(const Duration(milliseconds: 1150));
      await tester.pump(const Duration(milliseconds: 350));
      expect(_colours(tester), [
        Colors.white,
        Colors.white,
        SelfxKioskTokens.homeOrange,
      ]);
      await tester.pump(
        const Duration(milliseconds: 1150),
      ); // Cycle ends at 4.5s.
      await tester.pump(const Duration(milliseconds: 2999));
      expect(_colours(tester), [
        Colors.white,
        Colors.white,
        SelfxKioskTokens.homeOrange,
      ]);
      expect(_scale(tester, 2), closeTo(1.05, 0.001));
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump(const Duration(milliseconds: 350));
      expect(_colours(tester), [
        SelfxKioskTokens.homeOrange,
        Colors.white,
        Colors.white,
      ]);
      expect(
        tester.getRect(find.byKey(const Key('home-animated-headline'))),
        initial,
      );
      for (var index = 0; index < 3; index++) {
        expect(
          tester.getSize(find.byKey(ValueKey('home-headline-scale-$index'))),
          phraseSizes[index],
        );
      }
      expect(
        tester
            .widget<Semantics>(find.byKey(const Key('home-animated-headline')))
            .properties
            .label,
        defaultIdlePresentation.title,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 20));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'reduced motion and secondary menus use static Love It highlight',
    (tester) async {
      await tester.pumpWidget(_page(reducedMotion: true));
      await tester.pump(const Duration(seconds: 20));
      expect(_colours(tester), [
        Colors.white,
        Colors.white,
        SelfxKioskTokens.homeOrange,
      ]);
      for (var index = 0; index < 3; index++) {
        expect(_scale(tester, index), 1);
      }
      await tester.pumpWidget(_page(enabled: false));
      await tester.pump(const Duration(seconds: 20));
      expect(_colours(tester), [
        Colors.white,
        Colors.white,
        SelfxKioskTokens.homeOrange,
      ]);
      expect(_scale(tester, 2), 1);
      await tester.pumpWidget(_page());
      expect(_colours(tester), [
        SelfxKioskTokens.homeOrange,
        Colors.white,
        Colors.white,
      ]);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('custom headlines are unchanged and hidden routes stop cycling', (
    tester,
  ) async {
    await tester.pumpWidget(_page(title: 'Welcome to our Store'));
    await tester.pump(const Duration(seconds: 20));
    expect(find.text('Welcome to our Store'), findsOneWidget);
    await tester.pumpWidget(_page(tickerEnabled: false));
    await tester.pump(const Duration(seconds: 20));
    expect(_colours(tester), [
      Colors.white,
      Colors.white,
      SelfxKioskTokens.homeOrange,
    ]);
    await tester.pumpWidget(_page());
    expect(_colours(tester), [
      SelfxKioskTokens.homeOrange,
      Colors.white,
      Colors.white,
    ]);
    // Idle pauses schedule no frames, so unrelated menu animations can settle.
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
}

List<Color?> _colours(WidgetTester tester) => [
  for (var index = 0; index < 3; index++)
    tester
        .widget<Text>(find.byKey(ValueKey('home-headline-phrase-$index')))
        .style!
        .color,
];

double _scale(WidgetTester tester, int index) => tester
    .widget<Transform>(find.byKey(ValueKey('home-headline-scale-$index')))
    .transform
    .storage[0];
Widget _page({
  String? title,
  bool reducedMotion = false,
  bool enabled = true,
  bool tickerEnabled = true,
}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(disableAnimations: reducedMotion),
    child: TickerMode(
      enabled: tickerEnabled,
      child: Scaffold(
        body: Center(
          child: AnimatedHomeHeadline(
            title: title ?? defaultIdlePresentation.title,
            style: const TextStyle(fontSize: 26, color: Colors.white),
            enabled: enabled,
          ),
        ),
      ),
    ),
  ),
);
