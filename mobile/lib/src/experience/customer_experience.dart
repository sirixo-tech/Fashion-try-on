import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';

typedef Json = Map<String, dynamic>;

class CustomerPhoto {
  final String id, url;
  final DateTime expiresAt;
  CustomerPhoto.fromJson(Json data)
    : id = data['id'] as String,
      url = data['url'] as String,
      expiresAt = DateTime.parse(data['expiresAt'] as String);
}

class CustomerLook {
  final String id, runId, name, payer;
  final bool nameIsDefault;
  final DateTime expiresAt;
  final CustomerPhoto result;
  final CustomerPhoto? person, outfit;
  CustomerLook.fromJson(Json data)
    : id = data['id'] as String,
      runId = data['runId'] as String,
      name = data['name'] as String? ?? 'Your look',
      nameIsDefault = data['nameIsDefault'] == true || data['name'] == null,
      payer = data['payer'] as String,
      expiresAt = DateTime.parse(data['expiresAt'] as String),
      result = CustomerPhoto.fromJson(data['result'] as Json),
      person = data['person'] is Json
          ? CustomerPhoto.fromJson(data['person'] as Json)
          : null,
      outfit = data['outfit'] is Json
          ? CustomerPhoto.fromJson(data['outfit'] as Json)
          : null;
}

/// This controller holds only the current signed-in customer's ephemeral state.
/// The API owns credit admission, payer selection, consent and image retention.
class CustomerExperience extends ChangeNotifier {
  final CustomerController auth;
  Json? summary, session, run, storeVisit;
  CustomerPhoto? person, outfit;
  Uint8List? personPreview, outfitPreview;
  Json? product;
  Json? demoProduct;
  List<Json> demoProducts = [], demoModels = [];
  bool demoLoading = false;
  String? demoError, demoModelId;
  List<CustomerLook> looks = [];
  List<Json> savedGarments = [];
  bool savedGarmentsLoading = false;
  List<Json> products = [];
  bool loading = true,
      busy = false,
      savedLoading = false,
      productsLoading = false;
  bool hasMoreLooks = false, hasMoreProducts = false;
  int savedPage = 0, productPage = 0;
  String? error, pollError, productsError;
  String? avatarError;
  bool usingAvatar = false;
  String? _requestId;
  String? _owner;
  int _epoch = 0;
  bool _disposed = false;
  Timer? _poll;
  bool _polling = false;
  CustomerExperience(this.auth) {
    _owner = auth.profile?.id;
    auth.addListener(_authChanged);
  }
  int? get remaining => (summary?['trial'] as Map?)?['remaining'] as int?;
  bool get available => summary?['generationAvailable'] == true;
  bool get storeMode => storeVisit != null;
  bool get generating =>
      run != null && !['COMPLETED', 'FAILED'].contains(run!['status']);
  bool get hasUncertainRequest => _requestId != null && run == null;
  bool get canGenerate =>
      available &&
      !busy &&
      !generating &&
      person != null &&
      (storeMode ? product != null : outfit != null && (remaining ?? 0) > 0);
  bool _valid(int epoch) =>
      !_disposed &&
      epoch == _epoch &&
      auth.stage == CustomerStage.ready &&
      auth.profile?.id == _owner;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _authChanged() {
    if (auth.stage != CustomerStage.ready || auth.profile?.id != _owner) {
      ++_epoch;
      _poll?.cancel();
      _owner = auth.profile?.id;
      summary = session = run = storeVisit = product = null;
      person = outfit = null;
      personPreview = outfitPreview = null;
      looks = [];
      savedGarments = [];
      products = [];
      demoProducts = demoModels = [];
      demoProduct = null;
      demoModelId = null;
      demoLoading = false;
      demoError = null;
      usingAvatar = false;
      avatarError = null;
      _requestId = null;
      _notify();
    }
  }

  static String message(Object e) => e is CustomerApiException
      ? e.message
      : 'Unable to complete that. Please try again.';

  Future<void> refresh() async {
    final epoch = _epoch;
    loading = summary == null;
    error = null;
    _notify();
    try {
      final data = await auth.authorized('/experience');
      if (_valid(epoch)) {
        summary = data;
        if (run == null && data['pendingRunId'] is String) {
          final pending = await auth.authorized(
            '/try-on/runs/${data['pendingRunId']}',
          );
          if (_valid(epoch) && run == null) {
            run = pending;
            session = {'id': pending['sessionId']};
            _schedule();
          }
        }
      }
    } catch (e) {
      if (_valid(epoch)) error = message(e);
    } finally {
      if (_valid(epoch)) {
        loading = false;
        _notify();
      }
    }
  }

  Future<void> loadDemoCatalog() async {
    if (demoLoading || storeMode) return;
    final epoch = _epoch;
    demoLoading = true;
    demoError = null;
    _notify();
    try {
      final data = await auth.authorized('/demo-catalog');
      if (!_valid(epoch)) return;
      demoProducts = (data['products'] as List).cast<Json>();
      demoModels = (data['models'] as List).cast<Json>();
    } catch (e) {
      if (_valid(epoch)) demoError = message(e);
    } finally {
      if (_valid(epoch)) {
        demoLoading = false;
        _notify();
      }
    }
  }

  bool isGarmentSaved(String source, String id) =>
      savedGarments.any((item) => item['source'] == source && item['id'] == id);

  Future<void> loadSavedGarments() async {
    if (savedGarmentsLoading) return;
    final epoch = _epoch;
    savedGarmentsLoading = true;
    _notify();
    try {
      final data = await auth.authorized('/saved-garments');
      if (_valid(epoch)) {
        savedGarments = (data['items'] as List).cast<Json>();
      }
    } finally {
      if (_valid(epoch)) {
        savedGarmentsLoading = false;
        _notify();
      }
    }
  }

  Future<void> toggleSavedGarment(String source, String id) async {
    final epoch = _epoch;
    final alreadySaved = isGarmentSaved(source, id);
    await auth.authorized(
      alreadySaved ? '/saved-garments/$source/$id' : '/saved-garments',
      method: alreadySaved ? 'DELETE' : 'POST',
      body: alreadySaved ? null : {'source': source, 'id': id},
    );
    if (_valid(epoch)) await loadSavedGarments();
  }

  Future<void> begin({
    Json? storeProduct,
    Json? selectedDemoProduct,
    String? selectedDemoModelId,
  }) async {
    if (generating || hasUncertainRequest) {
      throw const CustomerApiException(
        'TRYON_PENDING',
        'Check your current Try-On before starting another.',
      );
    }
    final epoch = _epoch;
    final data = await auth.authorized(
      '/try-on/sessions',
      method: 'POST',
      body: {
        'consentAccepted': true,
        'consentVersion': summary!['consentVersion'],
        // A future policy without a bundled translation is displayed in English.
        'consentLanguage': summary!['consentVersion'] == '2026-10-26'
            ? auth.language
            : 'en',
        if (storeVisit != null) 'storeVisitId': storeVisit!['id'],
      },
    );
    if (!_valid(epoch)) return;
    _poll?.cancel();
    session = data;
    product = storeProduct;
    demoProduct = selectedDemoProduct;
    demoModelId = null;
    run = null;
    person = outfit = null;
    personPreview = outfitPreview = null;
    _requestId = null;
    pollError = null;
    avatarError = null;
    usingAvatar = false;
    if (selectedDemoModelId != null) {
      final saved = await auth.authorized(
        '/try-on/sessions/${data['id']}/demo/PERSON',
        method: 'POST',
        body: {'id': selectedDemoModelId},
      );
      if (!_valid(epoch) || session?['id'] != data['id']) return;
      person = CustomerPhoto.fromJson(saved);
      demoModelId = selectedDemoModelId;
    } else if (auth.profile?.avatarSupported == true) {
      try {
        final saved = await auth.authorized(
          '/try-on/sessions/${data['id']}/avatar',
          method: 'POST',
        );
        if (!_valid(epoch) || session?['id'] != data['id']) return;
        if (saved['id'] is String) {
          person = CustomerPhoto.fromJson(saved);
          usingAvatar = true;
        }
      } catch (_) {
        if (_valid(epoch)) {
          avatarError =
              'Couldn’t load your avatar. Choose a photo for this Try-On.';
        }
      }
    }
    if (selectedDemoProduct != null) {
      final saved = await auth.authorized(
        '/try-on/sessions/${data['id']}/demo/GARMENT',
        method: 'POST',
        body: {'id': selectedDemoProduct['id']},
      );
      if (!_valid(epoch) || session?['id'] != data['id']) return;
      outfit = CustomerPhoto.fromJson(saved);
    }
    _notify();
  }

  Future<void> chooseDemoModel(String id) async {
    if (session == null ||
        busy ||
        generating ||
        hasUncertainRequest ||
        storeMode) {
      return;
    }
    final epoch = _epoch, sessionId = session!['id'];
    busy = true;
    _notify();
    try {
      final saved = await auth.authorized(
        '/try-on/sessions/$sessionId/demo/PERSON',
        method: 'POST',
        body: {'id': id},
      );
      if (!_valid(epoch) || session?['id'] != sessionId) return;
      person = CustomerPhoto.fromJson(saved);
      personPreview = null;
      usingAvatar = false;
      demoModelId = id;
      avatarError = null;
      _requestId = null;
    } finally {
      if (_valid(epoch)) {
        busy = false;
        _notify();
      }
    }
  }

  Future<void> chooseDemoProduct(String id) async {
    if (session == null ||
        busy ||
        generating ||
        hasUncertainRequest ||
        storeMode) {
      return;
    }
    final epoch = _epoch, sessionId = session!['id'];
    busy = true;
    _notify();
    try {
      final saved = await auth.authorized(
        '/try-on/sessions/$sessionId/demo/GARMENT',
        method: 'POST',
        body: {'id': id},
      );
      if (!_valid(epoch) || session?['id'] != sessionId) return;
      outfit = CustomerPhoto.fromJson(saved);
      outfitPreview = null;
      demoProduct = demoProducts.where((item) => item['id'] == id).firstOrNull;
      _requestId = null;
    } finally {
      if (_valid(epoch)) {
        busy = false;
        _notify();
      }
    }
  }

  void clearSelectedPhoto(String purpose) {
    if (busy || generating || hasUncertainRequest) return;
    if (purpose == 'PERSON') {
      person = null;
      personPreview = null;
      demoModelId = null;
      usingAvatar = false;
      avatarError = null;
    } else if (purpose == 'GARMENT' && !storeMode) {
      outfit = null;
      outfitPreview = null;
      demoProduct = null;
    } else {
      return;
    }
    _requestId = null;
    _notify();
  }

  void chooseStoreProduct(Json selected) {
    if (!storeMode ||
        session == null ||
        busy ||
        generating ||
        hasUncertainRequest) {
      return;
    }
    product = selected;
    outfit = null;
    outfitPreview = null;
    _notify();
  }

  Future<void> chooseAvatar() async {
    if (session == null ||
        busy ||
        generating ||
        hasUncertainRequest ||
        storeMode) {
      return;
    }
    final epoch = _epoch, sessionId = session!['id'];
    busy = true;
    _notify();
    try {
      final saved = await auth.authorized(
        '/try-on/sessions/$sessionId/avatar',
        method: 'POST',
      );
      if (!_valid(epoch) || session?['id'] != sessionId) return;
      if (saved['id'] is! String) {
        throw const CustomerApiException(
          'AVATAR_MISSING',
          'Add a full-body photo in My avatar first.',
        );
      }
      person = CustomerPhoto.fromJson(saved);
      personPreview = null;
      usingAvatar = true;
      demoModelId = null;
      avatarError = null;
      _requestId = null;
    } finally {
      if (_valid(epoch)) {
        busy = false;
        _notify();
      }
    }
  }

  Future<void> upload(String purpose, Uint8List bytes, String mime) async {
    if (session == null || generating || hasUncertainRequest) return;
    final epoch = _epoch, sessionId = session!['id'];
    busy = true;
    _notify();
    try {
      final data = await auth.authorizedUpload(
        '/try-on/sessions/$sessionId/photos/$purpose',
        bytes,
        mime,
      );
      if (!_valid(epoch) || session?['id'] != sessionId) return;
      if (purpose == 'PERSON') {
        person = CustomerPhoto.fromJson(data);
        personPreview = bytes;
        usingAvatar = false;
        demoModelId = null;
        avatarError = null;
      } else {
        outfit = CustomerPhoto.fromJson(data);
        outfitPreview = bytes;
        demoProduct = null;
      }
      _requestId = null;
    } finally {
      if (_valid(epoch)) {
        busy = false;
        _notify();
      }
    }
  }

  Future<void> generate() async {
    if (busy || generating || (!canGenerate && !hasUncertainRequest)) return;
    final epoch = _epoch;
    _requestId ??= const Uuid()
        .v4(); // Kept after a timeout: retrying cannot buy two runs.
    busy = true;
    pollError = null;
    _notify();
    try {
      final data = await auth.authorized(
        '/try-on/runs',
        method: 'POST',
        body: {
          'sessionId': session!['id'],
          'clientRequestId': _requestId,
          'personAssetId': person!.id,
          if (storeMode)
            'productId': product!['id']
          else
            'garmentAssetId': outfit!.id,
        },
      );
      if (!_valid(epoch)) return;
      run = data;
      if (!generating) _requestId = null;
      _schedule();
      await refresh();
    } on CustomerApiException catch (e) {
      if (_valid(epoch) &&
          e.status >= 400 &&
          e.status < 500 &&
          ![408, 429].contains(e.status)) {
        _requestId = null;
      }
      rethrow;
    } finally {
      if (_valid(epoch)) {
        busy = false;
        _notify();
      }
    }
  }

  void _schedule() {
    _poll?.cancel();
    if (generating && !_disposed) {
      _poll = Timer(const Duration(seconds: 3), () => unawaited(checkRun()));
    }
  }

  Future<void> checkRun() async {
    if (run == null || _polling || _disposed) return;
    final epoch = _epoch, id = run!['id'];
    _polling = true;
    try {
      final data = await auth.authorized('/try-on/runs/$id');
      if (!_valid(epoch) || run?['id'] != id) return;
      run = data;
      pollError = null;
      if (!generating) {
        _requestId = null;
        await refresh();
        await loadSaved();
      }
    } catch (e) {
      if (_valid(epoch)) pollError = message(e);
    } finally {
      _polling = false;
      if (_valid(epoch)) {
        _notify();
        _schedule();
      }
    }
  }

  void pause() {
    _poll?.cancel();
  }

  void resume() {
    if (generating) unawaited(checkRun());
    unawaited(refresh());
  }

  Future<void> loadSaved({bool more = false}) async {
    if (savedLoading) return;
    final epoch = _epoch, page = more ? savedPage + 1 : 1;
    savedLoading = true;
    _notify();
    try {
      final data = await auth.authorized('/looks?page=$page');
      if (!_valid(epoch)) return;
      final values = (data['data'] as List? ?? [])
          .cast<Json>()
          .where((v) => v['result'] is Json)
          .map(CustomerLook.fromJson)
          .toList();
      looks = more ? [...looks, ...values] : values;
      savedPage = page;
      hasMoreLooks = (data['pagination'] as Map?)?['hasMore'] == true;
    } finally {
      if (_valid(epoch)) {
        savedLoading = false;
        _notify();
      }
    }
  }

  Future<void> deleteLook(CustomerLook look) async {
    final epoch = _epoch;
    await auth.authorized('/looks/${look.id}', method: 'DELETE');
    if (_valid(epoch)) {
      looks.removeWhere((item) => item.id == look.id);
      _notify();
      await refresh();
    }
  }

  Future<void> erasePhotos() async {
    final epoch = _epoch;
    await auth.authorized('/photos', method: 'DELETE');
    if (!_valid(epoch)) return;
    ++_epoch;
    savedLoading = productsLoading = busy = false;
    _poll?.cancel();
    run = session = product = storeVisit = null;
    demoProduct = null;
    demoModelId = null;
    person = outfit = null;
    personPreview = outfitPreview = null;
    looks = [];
    products = [];
    _requestId = null;
    _notify();
    await refresh();
  }

  Future<void> joinStore(String payload) async {
    if (generating || hasUncertainRequest) {
      throw const CustomerApiException(
        'TRYON_PENDING',
        'Check your current Try-On before visiting a Store.',
      );
    }
    final epoch = _epoch;
    final data = await auth.authorized(
      '/store-visits',
      method: 'POST',
      body: {'payload': payload.trim()},
    );
    if (!_valid(epoch)) return;
    ++_epoch;
    savedLoading = productsLoading = busy = false;
    storeVisit = data;
    demoProduct = null;
    demoModelId = null;
    demoLoading = false;
    session = run = product = null;
    _requestId = null;
    person = outfit = null;
    personPreview = outfitPreview = null;
    products = [];
    _notify();
    await loadProducts();
  }

  Future<void> loadProducts({bool more = false}) async {
    if (storeVisit == null || productsLoading) return;
    final epoch = _epoch, page = more ? productPage + 1 : 1;
    productsLoading = true;
    productsError = null;
    _notify();
    try {
      final data = await auth.authorized(
        '/store-visits/${storeVisit!['id']}/products?page=$page',
      );
      if (!_valid(epoch)) return;
      final values = (data['data'] as List).cast<Json>();
      products = more ? [...products, ...values] : values;
      productPage = page;
      hasMoreProducts = (data['pagination'] as Map?)?['hasMore'] == true;
    } catch (e) {
      if (_valid(epoch)) productsError = message(e);
      rethrow;
    } finally {
      if (_valid(epoch)) {
        productsLoading = false;
        _notify();
      }
    }
  }

  Future<void> leaveStore() async {
    if (generating || hasUncertainRequest) {
      throw const CustomerApiException(
        'TRYON_PENDING',
        'Check your current Try-On before leaving the Store.',
      );
    }
    final epoch = _epoch;
    if (storeVisit != null) {
      await auth.authorized(
        '/store-visits/${storeVisit!['id']}',
        method: 'DELETE',
      );
    }
    if (!_valid(epoch)) return;
    ++_epoch;
    savedLoading = productsLoading = busy = false;
    storeVisit = session = run = product = null;
    demoProduct = null;
    demoModelId = null;
    demoLoading = false;
    _requestId = null;
    person = outfit = null;
    personPreview = outfitPreview = null;
    products = [];
    _notify();
    if (demoProducts.isEmpty) await loadDemoCatalog();
  }

  @override
  void dispose() {
    _disposed = true;
    ++_epoch;
    _poll?.cancel();
    auth.removeListener(_authChanged);
    personPreview = outfitPreview = null;
    super.dispose();
  }
}
