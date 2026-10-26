import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'customer_language.dart';

/// Bundled UI copy only. Merchant names, user names and release notes remain raw Text.
class CustomerCopy {
  final String language;
  final Map<String, String> messages;
  late final List<_CopyTemplate> _templates =
      messages.keys
          .where((key) => key.contains(RegExp(r'\{p\d+\}')))
          .map(_CopyTemplate.new)
          .toList()
        ..sort((a, b) => b.literalLength.compareTo(a.literalLength));
  CustomerCopy(this.language, this.messages);
  static final english = CustomerCopy('en', const {});
  static CustomerCopy of(BuildContext context) =>
      Localizations.of<CustomerCopy>(context, CustomerCopy) ?? english;
  static const delegate = _CustomerCopyDelegate();
  bool get rtl => language == 'ar' || language == 'ur';
  String number(num value) =>
      NumberFormat.decimalPattern(language).format(value);
  String date(DateTime value) =>
      DateFormat.yMMMd(language).format(value.toLocal());
  String text(String source, {bool error = false}) {
    if (language == 'en') return source;
    if (messages[source] case final String translated) return translated;
    if (RegExp(r'^\d+$').hasMatch(source)) return number(int.parse(source));
    for (final template in _templates) {
      final match = template.pattern.firstMatch(source);
      if (match == null) continue;
      var result = messages[template.source]!;
      for (var index = 0; index < template.arguments.length; index++) {
        var value = match.group(index + 1)!;
        // Only these arguments are UI labels. Other arguments are customer data.
        if (template.source == 'Add {p0}' ||
            template.source == 'Change {p0}' ||
            template.source.startsWith('Expires {p0} ·') ||
            template.source.startsWith('Personal credits:')) {
          value = messages[value] ?? value;
        }
        if (RegExp(r'^\d+$').hasMatch(value)) value = number(int.parse(value));
        result = result.replaceAll(
          template.arguments[index],
          rtl ? '\u2068$value\u2069' : value,
        );
      }
      return result;
    }
    return error
        ? messages['Something went wrong. Please try again.'] ?? source
        : source;
  }
}

class _CopyTemplate {
  final String source;
  late final List<String> arguments;
  late final RegExp pattern;
  late final int literalLength;
  _CopyTemplate(this.source) {
    final placeholders = RegExp(r'\{p\d+\}').allMatches(source).toList();
    arguments = placeholders.map((item) => item.group(0)!).toList();
    var offset = 0, expression = '^';
    literalLength =
        source.length -
        arguments.fold<int>(0, (sum, value) => sum + value.length);
    for (final item in placeholders) {
      expression +=
          '${RegExp.escape(source.substring(offset, item.start))}(.*?)';
      offset = item.end;
    }
    pattern = RegExp(
      '$expression${RegExp.escape(source.substring(offset))}\$',
      dotAll: true,
    );
  }
}

class _CustomerCopyDelegate extends LocalizationsDelegate<CustomerCopy> {
  const _CustomerCopyDelegate();
  static final _cache = <String, CustomerCopy>{};
  @override
  bool isSupported(Locale locale) =>
      CustomerLanguage.supports(locale.languageCode);
  @override
  Future<CustomerCopy> load(Locale locale) {
    final code = CustomerLanguage.normalize(locale.languageCode);
    final cached = _cache[code];
    if (cached != null) return SynchronousFuture(cached);
    return rootBundle.load('assets/l10n/$code.json').then((bytes) {
      // These small catalogs need no background isolate startup on each switch.
      final data =
          jsonDecode(
                utf8.decode(
                  bytes.buffer.asUint8List(
                    bytes.offsetInBytes,
                    bytes.lengthInBytes,
                  ),
                ),
              )
              as Map<String, dynamic>;
      return _cache[code] = CustomerCopy(code, data.cast<String, String>());
    });
  }

  @override
  bool shouldReload(_CustomerCopyDelegate old) => false;
}

String tr(BuildContext context, String value) =>
    CustomerCopy.of(context).text(value);
String? trNullable(BuildContext context, String? value) =>
    value == null ? null : tr(context, value);

/// Retains const UI constructors while resolving copy against the current locale.
class CustomerText extends StatelessWidget {
  final String data;
  final TextStyle? style;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;
  final bool? softWrap;
  final String? semanticsLabel;
  final bool error;
  const CustomerText(
    this.data, {
    super.key,
    this.style,
    this.textAlign,
    this.maxLines,
    this.overflow,
    this.softWrap,
    this.semanticsLabel,
    this.error = false,
  });
  @override
  Widget build(BuildContext context) => Text(
    CustomerCopy.of(context).text(data, error: error),
    style: style,
    textAlign: textAlign,
    maxLines: maxLines,
    overflow: overflow,
    softWrap: softWrap,
    semanticsLabel: semanticsLabel == null
        ? null
        : tr(context, semanticsLabel!),
  );
}

/// Codes remain ASCII in the API even when the keyboard produces localized digits.
class CustomerCodeFormatter extends TextInputFormatter {
  const CustomerCodeFormatter();
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    const starts = [
      0x660,
      0x6f0,
      0x966,
      0x9e6,
      0xae6,
      0xbe6,
      0xc66,
      0xce6,
      0xd66,
    ];
    final normalized = String.fromCharCodes(
      newValue.text.runes.map((rune) {
        for (final start in starts) {
          if (rune >= start && rune < start + 10) return 48 + rune - start;
        }
        return rune;
      }),
    );
    return newValue.copyWith(text: normalized);
  }
}
