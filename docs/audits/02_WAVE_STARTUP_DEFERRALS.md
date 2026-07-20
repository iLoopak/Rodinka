# Rodinka — Wave 2: nízkorizikové startup deferrals a lazy globální UI

Navazuj na dokončenou Wave 1.

Cílem je odstranit jasně nepotřebnou práci z cold startupu bez zásahu do složitých offline a realtime architektur.

Tato vlna má řešit pouze nízkorizikové oblasti, jejichž data nejsou nutná pro první Home render ani globální shell.

## Cíle

1. Nemountovat tělo globálního Create Record wizardu, pokud je zavřené.
2. Odložit `meal_ingredients` do okamžiku skutečné potřeby.
3. Oddělit current-device push stav od plného seznamu push zařízení.
4. Odstranit duplicate child-account fetch při prvním otevření Family route.
5. Změřit pokles startup requestů a eager importů.

## Implementace

### A. Create Record wizard

Globální `CreateRecordProvider` a controller musí zůstat dostupný v celém shellu.

Těžké tělo `CreateRecordWizard` však:

- nemá být mounted, pokud `isOpen === false`,
- nemá eager importovat všechny feature formuláře při startu,
- má se lazy-loadnout až při otevření,
- musí zachovat aktuální open context, selected type, dirty state a browser-history chování.

Doporučený směr:

```text
CreateRecordProvider
→ malý globální controller
→ conditional lazy CreateRecordWizardBody
```

Zajisti, že otevření wizardu z jakékoli route stále funguje bez ztráty kontextu.

### B. Meal ingredients

Audit ukázal, že Shopping provider načítá `meal_ingredients` při startupu, přestože tato data nejsou potřeba pro Home ani běžný Shopping list.

Přesuň načtení tak, aby proběhlo až při workflow, které ingredience skutečně používá, například:

- přidání ingrediencí z jídla,
- Meals detail/planning workflow,
- explicitní otevření příslušného dialogu.

Podmínky:

- nevytvářej paralelní source of truth,
- zachovej existující cache/repository hranici,
- repeated open nemá generovat duplicate concurrent request,
- loading/error/empty stav musí být explicitní.

### C. Push device list

Rozděl Push data na:

1. lehký current-device / permission / registration stav potřebný globálně,
2. plný seznam `push_subscriptions` potřebný pouze v device-management UI.

Plný seznam zařízení nenačítej při každém startupu.

Musí zůstat funkční:

- reminder push prompt,
- messages push prompt,
- current subscription reconciliation,
- `pushsubscriptionchange`,
- device management na Reminder/More obrazovce.

### D. Family child accounts

Najdi a odstraň duplicate initial fetch `child_accounts`, který může vzniknout kombinací:

- interního mount efektu hooku,
- efektu ve `FamilyScreen`.

Urči jeden explicitní vlastník initial refresh triggeru.

Membership změna a manual refresh musí zůstat funkční.

### E. Startup instrumentation

Použij existující nebo přidej development-only request diagnostics pro měření:

- počet Supabase reads při cold startupu,
- počet signed URL requestů,
- počet lazy-loaded modulů až po otevření wizardu,
- počet push device-list requestů,
- počet child-account requestů při první návštěvě Family.

Neloguj payloady ani osobní data.

## Testy

Doplň testy pro:

1. zavřený Create Record wizard nemountuje feature formuláře,
2. otevření wizardu lazy-loadne tělo a zachová context,
3. dirty/back/close behavior wizardu zůstává funkční,
4. `meal_ingredients` se nenačítají při startupu,
5. concurrent ingredient consumers deduplikují request,
6. push current-device stav funguje bez plného device listu,
7. device list se načte až při otevření management UI,
8. Family route provede právě jeden initial child-account request,
9. membership změna načte nový scope,
10. žádné route nebo Home UX regrese.

## Dokumentace

Vytvoř:

```text
docs/implementation/WAVE_2_STARTUP_DEFERRALS.md
```

Uveď:

- startup request count před a po,
- co bylo odloženo,
- kdy se nyní data načítají,
- případné loading UX změny,
- zbývající P0 startup operace.

## Co neměnit

- Calendar startup sync,
- Messages provider architecture,
- auth/family bootstrap,
- offline mutation queues,
- RLS a databázové schema,
- business logiku formulářů.

## Acceptance criteria

- Zavřený Create Record wizard nezpůsobuje subscriptions k osmi doménám přes své tělo.
- Wizard forms nejsou eager součástí startup import graphu, pokud to bundler umožňuje.
- `meal_ingredients` nejsou startup request.
- Plný push device list není startup request.
- Family route nemá duplicate initial child-account request.
- Home, push, wizard a Meals/Shopping integrační workflow zůstávají funkční.
