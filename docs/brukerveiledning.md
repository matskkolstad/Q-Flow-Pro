# Brukerveiledning – Q-Flow Pro

Denne veiledningen er for de som bruker køsystemet til daglig: administratorer som setter det opp, og operatører som betjener skrankene. Installasjon står i [INSTALLATION.md](../INSTALLATION.md).

Adressene nedenfor er relative til serveren, for eksempel `http://192.168.1.50:3000/#/display`.

## Oversikt

| Skjerm | Adresse | Brukes til |
|---|---|---|
| Startside | `/` | Snarveier til alle skjermene |
| Innlogging | `/#/login` | Ansatte logger inn |
| Adminpanel | `/#/admin` | Operatørpanel, statistikk, logg og innstillinger |
| Storskjerm | `/#/display` | TV-en i venterommet: hvem som betjenes nå og hvem som står neste |
| Skrankeskjerm | `/#/counter-display` | Liten skjerm ved hver skranke: nummeret som betjenes der |
| Kiosk | `/#/kiosk` | Berøringsskjerm der kundene trekker kølapp |
| Mobil | `/#/mobile/new` | Kunden trekker kølapp på egen mobil (QR-koden på storskjermen) |
| Min billett | `/#/ticket/…` | Kunden følger sin egen billett (lenke/QR fra kiosken eller mobilen) |

Språk (norsk/engelsk) velges med knappen øverst på skjermene.

---

## Del 1: For operatører

### Logge inn og velge skranke
1. Åpne `/#/admin` og logg inn med brukernavn og passord (eller Google/OIDC-knappen hvis det er satt opp).
2. Første gang kan du bli bedt om å velge nytt passord. Det må ha minst 8 tegn, med store og små bokstaver og et tall.
3. Velg **din skranke** øverst i **Oversikt**. Valget huskes på denne PC-en.

### Kalle inn kunder
- **Kall inn neste**: serveren velger neste billett for skranken din (høyest prioritet først, deretter den som har ventet lengst). To skranker kan aldri få samme billett.
- **Hent** i køoversikten: kaller inn en bestemt billett.
- Storskjermen og skrankeskjermen viser nummeret, spiller en pling og leser det opp.

### Mens du betjener en kunde
| Knapp | Hva skjer |
|---|---|
| **Kall igjen** | Nummeret ropes opp på nytt på skjermene |
| **Fullfør sak** | Billetten er ferdig |
| **Fullfør og kall neste** | Fullfører og kaller inn neste med én gang |
| **Møtte ikke** | Kunden kom ikke. Telles som «møtte ikke» i statistikken |
| **Tilbake i køen** | Billetten settes tilbake i køen (for eksempel hvis kunden må hente noe) |
| **Overfør til** | Flytter kunden til køen for en annen tjeneste. Tiden kunden har ventet, teller fortsatt |

Søppelbøtta i køoversikten kansellerer en ventende billett.

### Nøkkeltall
Oversikten viser antall i kø, snittventetid i dag, hvor mange som er betjent i dag og hvilke skranker som er online. Under **Statistikk** finner du mer (se del 3).

### Hvis noe ikke virker
- **«Frakoblet»**: nettverket til serveren er borte. Siden kobler til igjen av seg selv.
- **«Denne skranken er stengt»**: en administrator må åpne skranken under *Innstillinger → Skranker*.
- Glemt passord: be en administrator sette et nytt under *Innstillinger → Brukere*.

---

## Del 2: For administratorer – oppsett

Alt ligger under **Innstillinger** i adminpanelet.

### Generelt
- **Åpne / steng køsystemet** manuelt. Stengt betyr at ingen kan trekke billetter, og skjermene viser en stengt-melding.
- **Melding på storskjerm**: rulletekst nederst på storskjermen.
- **Lyd**: pling, opplesning og lydeffekter på kiosk og i operatørpanelet.
- **Nullstill system**: tømmer køen og starter nummereringen på nytt. Statistikken beholdes. Skjer også automatisk hver natt.

### Design
- **Logo**: last opp PNG, JPG, WebP eller SVG (store bilder skaleres ned), eller bruk en nettadresse. En logo fra nettadresse vises bare på skjermene; vil du ha logoen på utskrevne billetter, må den lastes opp.
- **Navn ved logo**, **hovedfarge** (hele grensesnittet følger fargen) og **tekst nederst på billetten**.
- **Taleoppkalling**: teksten som leses opp, for eksempel `Nummer {number}, til {counter}`.
- **Offentlig adresse**: adressen kundene skal bruke i QR-koder, for eksempel `https://kø.firma.no`. La stå tom for å bruke adressen skjermen ble åpnet på.

### Tjenester
Det kundene velger mellom på kiosken, for eksempel «Salg» og «Service».
- **Prefiks** (1–3 tegn) blir første del av nummeret: `S001`, `S002` … Hver tjeneste har sin egen nummerserie.
- **Estimert tid** per kunde brukes til å beregne ventetid.
- **Prioritet**: høyere tall kalles inn først.
- **Åpen**: slå av for å stoppe nye billetter til tjenesten. De som allerede venter, betjenes som vanlig.
- Sletter du en tjeneste, kanselleres åpne billetter til den.

### Skranker
- Opprett én skranke per betjeningsplass.
- Velg hvilke tjenester skranken håndterer. Ingen valgt betyr alle tjenester.
- Sletter du en skranke, settes billetten som betjenes der tilbake i køen.

### Brukere
- **Admin** har tilgang til alt. **Operatør** kan betjene køen, se statistikk og logg og bytte eget passord.
- Kryss av for **Må bytte passord ved neste innlogging** når du lager et midlertidig passord.
- Det må alltid finnes minst én admin, og du kan ikke slette deg selv.

### Enheter
**Skrivere**
1. Legg til skriveren med navn, IP-adresse og port (vanligvis 9100). Støtter Epson TM og andre ESC/POS-skrivere.
2. Trykk **Testutskrift**.
3. **Skriv ut QR-kode på billetten** lar kunden følge køen på mobilen.

**Kiosker**
1. Sett en **kiosk-PIN** (4–12 sifre). Den trengs for å avslutte kioskmodus.
2. Åpne `/#/kiosk` på kiosk-enheten, logg inn som admin og trykk **Aktiver kiosk**. Du blir logget ut, og enheten får sin egen kiosktilgang.
3. Kiosken dukker opp under **Aktive kiosker**. Velg skriveren den skal bruke.
4. For å avslutte kioskmodus på enheten: trykk 5 ganger øverst til høyre og skriv PIN-koden.
5. **Fjern kiosk** deaktiverer enheten; den må aktiveres på nytt for å brukes igjen.

Kioskoppførsel: hvor lenge billetten vises før kiosken går tilbake til start, og om den skal vise QR-kode.

**Skrankeskjermer**
1. Åpne `/#/counter-display` på skjermen ved skranken.
2. Den dukker opp under **Aktive skrankeskjermer**. Velg skranke. Endringen vises på skjermen med en gang.
3. Du kan legge inn en egen melding for hver skjerm, for eksempel «Lunsj 11:30–12:00».

### Åpningstider og jobber
- **Åpningstider**: køen åpner og stenger av seg selv per ukedag. Du kan fortsatt åpne eller stenge manuelt; det gjelder til neste planlagte endring.
- **Daglig nullstilling** (standard 04:00): tømmer køen og starter på 001 igjen.
- **Automatisk backup** (standard 02:30).
- Tidene følger serverens klokke. Står den på feil tidssone, sett `TZ=Europe/Oslo` i `.env` og start tjenesten på nytt.

### Backup
- **Opprett backup**, last ned eller slett en backup.
- **Gjenopprett**: bytter ut alle data med innholdet i backupen. Dagens data lagres som en egen backup først, og de som er logget inn, forblir innlogget.
- **Last opp backup**: for å flytte til en ny server eller hente tilbake en backup du har lastet ned. Gjenopprett den etterpå.

### Innloggingsmetoder
Innlogging med Google Workspace eller OIDC (Entra ID, Keycloak …). Se [oauth-oidc-auth.md](oauth-oidc-auth.md).

### Min konto
Bytt ditt eget passord.

---

## Del 3: Statistikk og logg

**Statistikk** (admin og operatør):
- Velg periode: *I dag*, *7 dager*, *30 dager* eller egne datoer.
- Antall billetter, fullført, møtte ikke, kansellert, snitt ventetid og snitt behandlingstid.
- Fordelt per tjeneste, per skranke, per dag og per time på døgnet (når billettene ble trukket).
- **Eksporter CSV** (admin): én linje per billett, kan åpnes i Excel.

**Logg**: hendelser som innlogginger, innkallinger og endringer i innstillinger. Kan filtreres, søkes i og eksporteres. Varsler (`ALERT`) er verdt å se på: mislykkede innlogginger og blokkerte forsøk.

---

## Del 4: Skjermene

### Storskjerm (`/#/display`)
- Viser nummeret som kalles inn nå (stort), de neste i køen i riktig rekkefølge, de sist innkalte og klokka.
- **Trykk én gang på skjermen** etter at den er åpnet, ellers blokkerer nettleseren lyden. Skjermen viser en knapp for det.
- Tips: bruk nettleserens fullskjerm (F11) eller kioskmodus. På en Raspberry Pi: `chromium --kiosk http://<server>:3000/#/display`, og start med `--autoplay-policy=no-user-gesture-required` for lyd uten trykk.

### Skrankeskjerm (`/#/counter-display`)
Viser nummeret som betjenes ved skranken, og eventuell melding. Den må kobles til en skranke under *Innstillinger → Enheter*.

### Kiosk (`/#/kiosk`)
Kunden velger tjeneste og får et nummer. Med skriver skrives lappen ut; uten skriver vises nummeret på skjermen sammen med en QR-kode kunden kan skanne for å følge køen. Kiosken går tilbake til start av seg selv.

### Mobil (`/#/mobile/new` og `/#/ticket/…`)
Kunden skanner QR-koden på storskjermen (eller kiosken), velger tjeneste og følger sin egen billett: plass i køen, estimert ventetid og beskjed (lyd, vibrasjon og varsel) når det er deres tur. Billetten kan kanselleres fra mobilen. Siden overlever at mobilen låses eller siden lastes på nytt.

---

## Vanlige spørsmål

**Nummereringen startet på 001 igjen.** Det skjer ved den daglige nullstillingen og ved manuell nullstilling. Statistikken er beholdt.

**Kiosken viser «Denne enheten er ikke en kiosk».** Den er ikke aktivert, eller den er fjernet i adminpanelet. Logg inn som admin på enheten og trykk *Aktiver kiosk*.

**Kiosken skriver ikke ut.** Sjekk at kiosken har fått en skriver under *Innstillinger → Enheter*, og bruk *Testutskrift*. Skriveren må være på samme nettverk som serveren (port 9100).

**Estimert ventetid virker feil.** Den regnes ut fra *estimert tid* per tjeneste og hvor mange skranker som er online. Juster tiden under *Innstillinger → Tjenester*.

**Køen åpner eller stenger på feil tidspunkt.** Sjekk tidssonen (`TZ` i `.env`) og åpningstidene.

**Alle administratorer er låst ute.** Bruk [kommandolinjeverktøyet](cli.md) på serveren.
