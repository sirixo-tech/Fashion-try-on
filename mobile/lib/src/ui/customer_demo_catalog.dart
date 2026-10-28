import 'package:flutter/material.dart';
import '../experience/customer_experience.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';

const _productImages = {
  'terracotta-blazer': 'assets/editorial/terracotta-blazer.webp',
  'burgundy-dress': 'assets/editorial/burgundy-dress.webp',
  'ivory-blouse': 'assets/editorial/ivory-blouse.webp',
  'black-wide-leg-trousers': 'assets/editorial/black-wide-leg-trousers.webp',
  'emerald-wrap-dress': 'assets/editorial/emerald-wrap-dress.webp',
  'blue-denim-jacket': 'assets/editorial/blue-denim-jacket.webp',
  'cream-cardigan': 'assets/editorial/cream-cardigan.webp',
  'cobalt-tunic': 'assets/editorial/cobalt-tunic.webp',
  'floral-midi-skirt': 'assets/editorial/floral-midi-skirt.webp',
  'white-linen-shirt': 'assets/editorial/white-linen-shirt.webp',
  'teal-saree': 'assets/editorial/teal-saree.webp',
  'ruby-saree': 'assets/editorial/ruby-saree.webp',
  'anarkali-dress': 'assets/editorial/anarkali-dress.webp',
  'navy-overshirt': 'assets/editorial/navy-overshirt.webp',
  'charcoal-blazer': 'assets/editorial/charcoal-blazer.webp',
  'mens-white-linen-shirt': 'assets/editorial/mens-white-linen-shirt.webp',
  'olive-bomber-jacket': 'assets/editorial/olive-bomber-jacket.webp',
  'black-straight-jeans': 'assets/editorial/black-straight-jeans.webp',
  'beige-chinos': 'assets/editorial/beige-chinos.webp',
  'mens-denim-jacket': 'assets/editorial/mens-denim-jacket.webp',
  'burgundy-polo': 'assets/editorial/burgundy-polo.webp',
  'heather-grey-hoodie': 'assets/editorial/heather-grey-hoodie.webp',
  'sand-kurta': 'assets/editorial/sand-kurta.webp',
  'sherwani': 'assets/editorial/sherwani.webp',
  'nehru-jacket': 'assets/editorial/nehru-jacket.webp',
  'printed-kurta': 'assets/editorial/printed-kurta.webp',
};
const _modelImages = {
  'muse': 'assets/editorial/demo-model-maya.webp',
  'tailored': 'assets/editorial/demo-model-arjun.webp',
  'aisha': 'assets/editorial/demo-model-aisha.webp',
  'zara': 'assets/editorial/demo-model-zara.webp',
  'kavya': 'assets/editorial/demo-model-kavya.webp',
  'rhea': 'assets/editorial/demo-model-rhea.webp',
  'nisha': 'assets/editorial/demo-model-nisha.webp',
  'meera': 'assets/editorial/demo-model-meera.webp',
  'ananya': 'assets/editorial/demo-model-ananya.webp',
  'priya': 'assets/editorial/demo-model-priya.webp',
  'tara': 'assets/editorial/demo-model-tara.webp',
  'kabir': 'assets/editorial/demo-model-kabir.webp',
  'dev': 'assets/editorial/demo-model-dev.webp',
  'rohan': 'assets/editorial/demo-model-rohan.webp',
  'vihaan': 'assets/editorial/demo-model-vihaan.webp',
  'imran': 'assets/editorial/demo-model-imran.webp',
  'ayaan': 'assets/editorial/demo-model-ayaan.webp',
  'neil': 'assets/editorial/demo-model-neil.webp',
  'sameer': 'assets/editorial/demo-model-sameer.webp',
  'kiran': 'assets/editorial/demo-model-kiran.webp',
  'amara': 'assets/editorial/demo-model-amara.webp',
  'yuna': 'assets/editorial/demo-model-yuna.webp',
  'malik': 'assets/editorial/demo-model-malik.webp',
  'kenji': 'assets/editorial/demo-model-kenji.webp',
};
String? demoProductImage(String id) => _productImages[id];
String? demoModelImage(String id) => _modelImages[id];

class CustomerDemoCatalog extends StatefulWidget {
  final CustomerExperience experience;
  final Future<void> Function(Json product, String? modelId) onTryOn;
  final Future<void> Function(Json product, String? modelId) onUploadPerson;
  const CustomerDemoCatalog({
    super.key,
    required this.experience,
    required this.onTryOn,
    required this.onUploadPerson,
  });

  @override
  State<CustomerDemoCatalog> createState() => _CustomerDemoCatalogState();
}

class _CustomerDemoCatalogState extends State<CustomerDemoCatalog> {
  String category = 'ALL';
  final search = TextEditingController();

  Future<void> toggleSaved(String id) async {
    try {
      await widget.experience.toggleSavedGarment('DEMO', id);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: CustomerText(CustomerExperience.message(error))),
        );
      }
    }
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final exp = widget.experience;
    final products = exp.demoProducts
        .where(
          (item) =>
              (category == 'ALL' || item['category'] == category) &&
              (item['name'] as String).toLowerCase().contains(
                search.text.trim().toLowerCase(),
              ),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: CustomerText(
                'Explore outfits',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            const Icon(
              Icons.auto_awesome_rounded,
              color: CustomerColors.orange,
            ),
          ],
        ),
        const SizedBox(height: 6),
        const CustomerText(
          'A starter collection for your first Try-On.',
          style: TextStyle(color: CustomerColors.muted),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: search,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            hintText: 'Search demo outfits',
            prefixIcon: Icon(Icons.search_rounded),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            for (final value in ['ALL', 'WOMEN', 'MEN'])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: SizedBox(
                    width: double.infinity,
                    child: ChoiceChip(
                      label: Center(
                        child: CustomerText(switch (value) {
                          'ALL' => 'All',
                          'WOMEN' => 'Women',
                          _ => 'Men',
                        }, textAlign: TextAlign.center),
                      ),
                      selected: category == value,
                      onSelected: (_) => setState(() => category = value),
                      selectedColor: CustomerColors.ink,
                      labelStyle: TextStyle(
                        color: category == value
                            ? Colors.white
                            : CustomerColors.ink,
                      ),
                      showCheckmark: false,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        if (exp.demoLoading && exp.demoProducts.isEmpty)
          const LinearProgressIndicator()
        else if (exp.demoError != null && exp.demoProducts.isEmpty) ...[
          CustomerNotice(
            'Could not load the demo collection. ${exp.demoError}',
            error: true,
          ),
          TextButton(
            onPressed: exp.loadDemoCatalog,
            child: const CustomerText('Try again'),
          ),
        ] else if (products.isEmpty)
          CustomerNotice(
            search.text.trim().isEmpty
                ? 'No demo outfits in this category yet.'
                : 'No demo outfits match your search.',
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final cardWidth = (constraints.maxWidth - 6) / 2;
              return GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: products.length,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 6,
                  mainAxisSpacing: 8,
                  childAspectRatio: cardWidth / (cardWidth / .75 + 82),
                ),
                itemBuilder: (context, index) {
                  final product = products[index];
                  final path = _productImages[product['id']];
                  if (path == null) return const SizedBox.shrink();
                  return Material(
                    color: Colors.white,
                    clipBehavior: Clip.antiAlias,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: const BorderSide(color: CustomerColors.line),
                    ),
                    child: InkWell(
                      onTap: () => Navigator.push<void>(
                        context,
                        MaterialPageRoute(
                          builder: (_) => CustomerDemoProductScreen(
                            experience: exp,
                            product: product,
                            models: exp.demoModels,
                            onTryOn: widget.onTryOn,
                            onUploadPerson: widget.onUploadPerson,
                          ),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AspectRatio(
                            aspectRatio: .75,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                Image.asset(path, fit: BoxFit.cover),
                                Align(
                                  alignment: Alignment.topRight,
                                  child: IconButton.filledTonal(
                                    tooltip:
                                        exp.isGarmentSaved(
                                          'DEMO',
                                          product['id'] as String,
                                        )
                                        ? 'Remove from saved garments'
                                        : 'Save garment',
                                    onPressed: () =>
                                        toggleSaved(product['id'] as String),
                                    icon: Icon(
                                      exp.isGarmentSaved(
                                            'DEMO',
                                            product['id'] as String,
                                          )
                                          ? Icons.favorite_rounded
                                          : Icons.favorite_border_rounded,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(8, 4, 8, 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const CustomerText(
                                  'SELFX DEMO',
                                  style: TextStyle(
                                    fontSize: 9,
                                    letterSpacing: 1.5,
                                    color: CustomerColors.orange,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                CustomerText(
                                  product['name'] as String,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
      ],
    );
  }
}

class CustomerDemoProductScreen extends StatefulWidget {
  final CustomerExperience experience;
  final Json product;
  final List<Json> models;
  final Future<void> Function(Json product, String? modelId) onTryOn;
  final Future<void> Function(Json product, String? modelId) onUploadPerson;
  const CustomerDemoProductScreen({
    super.key,
    required this.experience,
    required this.product,
    required this.models,
    required this.onTryOn,
    required this.onUploadPerson,
  });

  @override
  State<CustomerDemoProductScreen> createState() =>
      _CustomerDemoProductScreenState();
}

class _CustomerDemoProductScreenState extends State<CustomerDemoProductScreen> {
  String? modelId;
  bool busy = false;

  Future<void> launch({bool upload = false}) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      if (upload) {
        await widget.onUploadPerson(widget.product, null);
      } else {
        await widget.onTryOn(widget.product, modelId);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final path = _productImages[widget.product['id']];
    final category = widget.product['category'];
    final models = widget.models
        .where(
          (item) =>
              _modelImages.containsKey(item['id']) &&
              (category != 'WOMEN' && category != 'MEN' ||
                  item['category'] == category),
        )
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: const CustomerText('Try it on'),
        actions: [
          ListenableBuilder(
            listenable: widget.experience,
            builder: (context, _) => IconButton(
              tooltip:
                  widget.experience.isGarmentSaved(
                    'DEMO',
                    widget.product['id'] as String,
                  )
                  ? 'Remove from saved garments'
                  : 'Save garment',
              onPressed: () async {
                try {
                  await widget.experience.toggleSavedGarment(
                    'DEMO',
                    widget.product['id'] as String,
                  );
                } catch (error) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: CustomerText(
                          CustomerExperience.message(error),
                        ),
                      ),
                    );
                  }
                }
              },
              icon: Icon(
                widget.experience.isGarmentSaved(
                      'DEMO',
                      widget.product['id'] as String,
                    )
                    ? Icons.favorite_rounded
                    : Icons.favorite_border_rounded,
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
        children: [
          if (path != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: AspectRatio(
                aspectRatio: .75,
                child: Image.asset(path, fit: BoxFit.cover),
              ),
            ),
          const SizedBox(height: 10),
          CustomerText(
            widget.product['name'] as String,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),
          CustomerText(
            'Choose a model',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 150,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: models.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final model = models[index], id = model['id'] as String;
                return InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () =>
                      setState(() => modelId = modelId == id ? null : id),
                  child: Container(
                    width: 105,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: modelId == id
                            ? CustomerColors.orange
                            : CustomerColors.line,
                        width: modelId == id ? 2 : 1,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        Expanded(
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Image.asset(
                                _modelImages[id]!,
                                fit: BoxFit.cover,
                                alignment: Alignment.topCenter,
                              ),
                              if (modelId == id)
                                const Align(
                                  alignment: Alignment.topRight,
                                  child: Padding(
                                    padding: EdgeInsets.all(7),
                                    child: Icon(
                                      Icons.check_circle,
                                      color: CustomerColors.orange,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(7),
                          child: CustomerText(
                            model['name'] as String,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: busy ? null : () => launch(upload: true),
            icon: const Icon(Icons.add_a_photo_outlined),
            label: const CustomerText('Upload my photo'),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: FilledButton.icon(
          onPressed: busy ? null : launch,
          icon: const Icon(Icons.auto_awesome_rounded),
          label: const CustomerText('Try it on'),
        ),
      ),
    );
  }
}
