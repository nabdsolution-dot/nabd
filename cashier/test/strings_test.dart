import 'package:flutter_test/flutter_test.dart';
import 'package:nabd_cashier/models.dart';
import 'package:nabd_cashier/strings.dart';

void main() {
  test('English and Arabic both resolve, with variables', () {
    currentLang = 'en';
    expect(t('pin.waiting', {'n': '3'}), '3 sales waiting to upload');
    currentLang = 'ar';
    expect(t('pin.waiting', {'n': '3'}), contains('3'));
    expect(t('lang.switch'), 'English');
    currentLang = 'en';
  });

  test('unknown keys fall back to the key itself', () {
    expect(t('no.such.key'), 'no.such.key');
  });

  test('amount parsing', () {
    expect(parseCents('12.50'), 1250);
    expect(parseCents('12,5'), 1250);
    expect(parseCents('abc'), isNull);
    expect(parseWhole('1,700,000'), 1700000);
  });
}
