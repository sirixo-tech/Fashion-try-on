import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import '../services/customer_country.dart';
import '../l10n/customer_copy.dart';
import 'customer_sheet.dart';
import 'customer_theme.dart';

class CustomerPhoneField extends StatefulWidget {
  final TextEditingController controller;
  final CustomerCountrySelection countries;
  final String label;
  final bool enabled, optional, allowEmail, compact;
  final VoidCallback? onChanged;
  const CustomerPhoneField({
    super.key,
    required this.controller,
    required this.countries,
    this.label = 'Phone number',
    this.enabled = true,
    this.optional = false,
    this.allowEmail = false,
    this.compact = false,
    this.onChanged,
  });
  @override
  State<CustomerPhoneField> createState() => CustomerPhoneFieldState();
}

class CustomerPhoneFieldState extends State<CustomerPhoneField> {
  Country? _country;
  bool phoneKeyboard = true;
  Country? get country => _country ?? widget.countries.selected;
  String? get canonical =>
      parseCustomerPhone(widget.controller.text, country)?.international;
  @override
  void initState() {
    super.initState();
    phoneKeyboard =
        !widget.allowEmail || widget.controller.text.trim().startsWith('+');
    final initial = parseCustomerPhone(widget.controller.text, country);
    if (initial != null && widget.controller.text.trim().startsWith('+')) {
      _country = CustomerCountrySelection.countries.findByCode(
        initial.isoCode.name,
      );
      widget.controller.text = initial.nsn;
    }
  }

  String name(BuildContext context, Country value) =>
      CountryLocalizations.of(
        context,
      )?.countryName(countryCode: value.countryCode) ??
      value.name;
  void changed() {
    final parsed = parseCustomerPhone(widget.controller.text, country);
    if (widget.controller.text.contains('@')) {
      phoneKeyboard = false;
    } else if (widget.controller.text.trim().startsWith('+') ||
        parsed != null) {
      phoneKeyboard = true;
    }
    if (parsed != null && widget.controller.text.trim().startsWith('+')) {
      _country = CustomerCountrySelection.countries.findByCode(
        parsed.isoCode.name,
      );
      widget.controller.value = TextEditingValue(
        text: parsed.nsn,
        selection: TextSelection.collapsed(offset: parsed.nsn.length),
      );
    }
    setState(() {});
    widget.onChanged?.call();
  }

  Future<void> select() async {
    FocusScope.of(context).unfocus();
    final next = await showCustomerSheet<Country>(
      context,
      (context) => _CountrySheet(selected: country),
    );
    if (!mounted || next == null) return;
    setState(() {
      _country = next;
      phoneKeyboard = true;
    });
    widget.onChanged?.call();
    if (!await widget.countries.choose(next) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: CustomerText('Country preference could not be saved.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.countries,
    builder: (context, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.compact) ...[
          CustomerText(
            widget.label,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (phoneKeyboard) ...[
              SizedBox(
                width: 108,
                child: OutlinedButton(
                  onPressed: widget.enabled ? select : null,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: const Size(48, 60),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: Semantics(
                    label: country == null
                        ? tr(context, 'Choose a country')
                        : '${name(context, country!)} +${country!.phoneCode}',
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            country == null
                                ? tr(context, 'Country')
                                : '${country!.countryCode} +${country!.phoneCode}',
                            textDirection: TextDirection.ltr,
                            maxLines: 2,
                            textAlign: TextAlign.center,
                          ),
                        ),
                        const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Semantics(
                label: tr(context, widget.label),
                child: TextFormField(
                  controller: widget.controller,
                  enabled: widget.enabled,
                  textDirection: TextDirection.ltr,
                  keyboardType: phoneKeyboard
                      ? TextInputType.phone
                      : TextInputType.emailAddress,
                  autofillHints: phoneKeyboard
                      ? const [AutofillHints.telephoneNumberNational]
                      : const [AutofillHints.email],
                  inputFormatters: widget.allowEmail && !phoneKeyboard
                      ? const []
                      : const [CustomerCodeFormatter()],
                  maxLength: widget.allowEmail ? 320 : 32,
                  decoration: InputDecoration(
                    hintText: widget.compact ? tr(context, widget.label) : null,
                    counterText: '',
                    errorMaxLines: 4,
                  ),
                  onChanged: (_) => changed(),
                  validator: (value) {
                    if (widget.optional && (value?.trim().isEmpty ?? true)) {
                      return null;
                    }
                    if (widget.allowEmail && (value?.contains('@') ?? false)) {
                      return RegExp(
                            r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                          ).hasMatch(value!.trim())
                          ? null
                          : tr(context, 'Enter a valid email address.');
                    }
                    return canonical == null
                        ? tr(
                            context,
                            'Enter a valid phone number with country code.',
                          )
                        : null;
                  },
                ),
              ),
            ),
          ],
        ),
        if (widget.allowEmail)
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(
              style: widget.compact
                  ? TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      minimumSize: const Size(48, 32),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                    )
                  : null,
              onPressed: widget.enabled
                  ? () {
                      setState(() {
                        phoneKeyboard = !phoneKeyboard;
                        widget.controller.clear();
                      });
                      widget.onChanged?.call();
                    }
                  : null,
              child: CustomerText(
                phoneKeyboard ? 'Use email' : 'Use phone number',
              ),
            ),
          ),
      ],
    ),
  );
}

class _CountrySheet extends StatefulWidget {
  final Country? selected;
  const _CountrySheet({this.selected});
  @override
  State<_CountrySheet> createState() => _CountrySheetState();
}

class _CountrySheetState extends State<_CountrySheet> {
  String search = '';
  String name(Country country) =>
      CountryLocalizations.of(
        context,
      )?.countryName(countryCode: country.countryCode) ??
      country.name;
  @override
  Widget build(BuildContext context) {
    final query = search.trim().toLowerCase().replaceFirst(RegExp(r'^\+'), '');
    final rows = CustomerCountrySelection.countries
        .getAll()
        .where(
          (country) =>
              country.name.toLowerCase().contains(query) ||
              name(country).toLowerCase().contains(query) ||
              country.countryCode.toLowerCase() == query ||
              country.phoneCode.startsWith(query),
        )
        .toList();
    return SizedBox(
      height:
          (MediaQuery.sizeOf(context).height -
                  MediaQuery.viewInsetsOf(context).bottom -
                  120)
              .clamp(200.0, 600.0),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            CustomerText(
              'Choose a country',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextField(
              onChanged: (value) => setState(() => search = value),
              decoration: InputDecoration(
                labelText: tr(context, 'Search country or calling code'),
                prefixIcon: const Icon(Icons.search_rounded),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: rows.isEmpty
                  ? const Center(child: CustomerText('No countries found.'))
                  : ListView.builder(
                      itemCount: rows.length,
                      itemBuilder: (context, index) {
                        final country = rows[index];
                        return ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 4,
                          ),
                          title: Text(name(country)),
                          subtitle: Text(
                            '${country.countryCode} · +${country.phoneCode}',
                            textDirection: TextDirection.ltr,
                          ),
                          trailing:
                              country.countryCode ==
                                  widget.selected?.countryCode
                              ? const Icon(
                                  Icons.check_rounded,
                                  color: CustomerColors.orange,
                                )
                              : null,
                          onTap: () => Navigator.pop(context, country),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
