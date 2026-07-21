# Manuální test matice — mobile/PWA layout

Audit: [`MOBILE_PWA_REGRESSION_AUDIT.md`](./MOBILE_PWA_REGRESSION_AUDIT.md)
Kontrakt: [`MOBILE_LAYOUT_HARDENING.md`](../implementation/MOBILE_LAYOUT_HARDENING.md)

Žádné Playwright/e2e prostředí v repozitáři není (`package.json` — jen Vitest/RTL/jsdom); tohle je náhrada pro to, co jsdom ani Chromium v Browser pane nemůže ověřit: skutečné `dvh`/`visualViewport` chování na iOS Safari, dynamickou URL lištu, a chování instalované PWA.

Spouštěj po každé změně dotýkající se `Modal`, `useScreenLock`, `useVisualViewportInset`, fullscreen routes, nebo `.modal-sheet*` CSS.

## Prostředí

| # | Prostředí | Jak nastavit |
| - | --- | --- |
| A | iOS Safari (browser tab) | reálné iPhone nebo Simulator, otevřít produkční/staging URL v Safari |
| B | Instalovaná iOS PWA | "Přidat na plochu" ze Safari, pak spouštět z ikony (standalone display mode) |
| C | Android Chrome | reálný telefon nebo emulátor |
| D | Offline | zapnutý letadlový režim / DevTools "Offline" throttling |

---

## 1. Dlouhý modal — scroll a sticky footer

**Kde:** Rodina → Upravit profil (dítě s zapnutým kapesným i přístupem), nebo Vytvořit záznam (jakýkoli typ s víc poli).

| Krok | Očekávaný výsledek |
| - | --- |
| Otevři modal | Vyplní celou obrazovku, hlavička appky (horní lišta, spodní nav) není vidět ani pod ním prosvítat |
| Scrolluj obsah až na konec | Poslední pole je plně čitelné, nic ho nepřekrývá |
| Sleduj footer (Uložit/Přidat) během scrollu | Zůstává přišpendlený dole po celou dobu, nikdy nezmizí ani neskočí |
| Zavři a znovu otevři na jiné entitě (jiné dítě/záznam) | Modal se otevře v detail/výchozím režimu s daty *nové* entity — ne v edit módu se starými hodnotami |

Prostředí: **A, B, C**.

## 2. Fullscreen route — Family Jump / Family Fleet

**Kde:** Herna → Family Jump nebo Family Fleet, včetně Hangáru.

| Krok | Očekávaný výsledek |
| - | --- |
| Otevři hru | Žádná horní lišta appky ani spodní navigace vidět — hra vlastní celou obrazovku od notch/status baru po home indicator |
| Scrolluj menu/výběr pilota | Jen jedna scrollující oblast; horní hlavička hry (pokud je) zůstává na místě |
| Spusť hru, sleduj HUD | Skóre/energie/tlačítka nejsou schované pod notch ani pod home indicator lištou |
| Otoč zařízení na šířku (pokud podporováno) a zpět | Layout se přepočítá bez zaseknutého scrollu nebo useknutého obsahu |

Prostředí: **A, B, C** (na B especially — instalovaná PWA nemá URL lištu vůbec, takže `dvh` by se nemělo měnit při scrollu).

## 3. Chat — fullscreen konverzace a klávesnice

**Kde:** Chat → otevřít libovolnou konverzaci.

| Krok | Očekávaný výsledek |
| - | --- |
| Otevři konverzaci | Fullscreen — appka hlavička/nav nejsou vidět |
| Ťukni do textového pole composeru | Klávesnice se otevře, textové pole a "Odeslat" tlačítko zůstanou nad klávesnicí, nikdy pod ní |
| Napiš delší zprávu (2+ řádky) | Textové pole roste, composer zůstává nad klávesnicí, historie zpráv nad composerem zůstává scrollovatelná |
| Zavři klávesnici (tap mimo pole / Hotovo) | Layout se vrátí do plné výšky bez "zamrzlé" mezery dole nebo nahoře |
| Zavři konverzaci zpět na seznam | Spodní navigace appky se objeví normálně, žádný zůstatkový zámek scrollu na seznamu konverzací |

Prostředí: **A, B, C** — tohle je nejdůležitější scénář pro A/B, protože `dvh` na iOS Safari se pro klávesnici nemění.

## 4. Formulář uvnitř modalu s klávesnicí

**Kde:** Vytvořit záznam (jakýkoli typ) nebo Upravit profil člena, textové pole (Jméno, Poznámka).

| Krok | Očekávaný výsledek |
| - | --- |
| Ťukni do textového pole blízko spodku viditelné oblasti | Klávesnice se otevře, pole i sticky footer zůstanou viditelné (posunou se nahoru, nezmizí pod klávesnicí) |
| Přepni mezi dvěma poli tabováním/ťuknutím | Žádné blikání layoutu, žádný nečekaný scroll na vrchol |
| Zavři klávesnici | Modal se vrátí na plnou výšku, žádná trvalá "zoomnutá" nebo useknutá stránka |

Prostředí: **A, B** (Android Chrome resize chování je typicky bez problému, ale zkontroluj pro jistotu na **C**).

## 5. Offline start a reconnect

**Kde:** cold start appky offline, pak návrat online.

| Krok | Očekávaný výsledek |
| - | --- |
| Zapni letadlový režim, otevři appku (pokud byla nainstalovaná/cachovaná) | Zobrazí se `OfflineFallbackScreen` — jednosloupcová karta, žádné rozbité/oříznuté prvky, tlačítka stejně široká |
| Vypni letadlový režim | Appka se automaticky obnoví/reconnectne bez nutnosti manuálního refreshe |
| Otevři modal (např. detail úkolu) offline, pak reconnect uprostřed | Modal si drží svůj stav, žádný neočekávaný unmount/reset kvůli reconnect logice |

Prostředí: **A, B, C, D**.

## 6. Bezpečné oblasti (safe areas)

**Kde:** libovolná fullscreen route nebo fullscreen modal na zařízení s notch/Dynamic Island a home indicator lištou (iPhone).

| Krok | Očekávaný výsledek |
| - | --- |
| Otevři fullscreen modal/route | Horní obsah nezačíná pod notch/status barem |
| Scrolluj na konec | Poslední interaktivní prvek (tlačítko, pole) není pod home indicator lištou |
| To samé na landscape (pokud appka landscape podporuje) | Levý/pravý safe area inset (notch na šířku) je respektovaný |

Prostředí: **A, B** (Android nemá ekvivalentní notch scénář ve stejné míře, ale zkontroluj gesture nav bar na **C**).

---

## Když test selže

Zapiš přesně: prostředí (A–D), krok, co se stalo místo očekávaného výsledku, a pokud možno screenshot/video. Odkaž na příslušný vzor v [`MOBILE_LAYOUT_HARDENING.md`](../implementation/MOBILE_LAYOUT_HARDENING.md), aby oprava šla do sdíleného primitivu, ne bodově do jedné obrazovky.
