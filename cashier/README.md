# Nabd cashier app (Flutter)

Landscape till for Windows, Android tablets and iPad. Signs in with a store PIN, sells offline, uploads sales when online.

## Features
- PIN sign-in (needs the server once), then selling works offline; sales queue on the device and upload without duplicates.
- Product grid, search, USB barcode scanner (types the code + Enter, exact match goes to the cart).
- 5% discount, and 10% when the cashier has permission. USD and LBP totals, VAT as on the server.
- Pay by cash USD, cash LBP or card; print an 80 mm receipt through the system print dialog.
- Returns by receipt number (online only, supervisor PIN for cashiers).
- Open and close a shift with cash counts and a note when the drawer does not match.
- English and Arabic (right to left), switch from the top bar.

## Run
```bash
flutter create . --platforms=android,windows   # once, generates platform folders
flutter pub get
flutter test
flutter run
```
First launch asks for the server address (for example http://192.168.1.20:4000), Store ID and Till ID.
In the back office, Stores and tills > "Copy setup" copies both IDs.
Demo PINs: Nour A. 4321 (cashier), Karim 1234 (supervisor).

## Status
Written without a Flutter SDK available, so it has not been compiled or run yet. Expect small fixes on first run.
Receipts use the built-in Latin font; Arabic product names on receipts need a bundled Arabic font.
