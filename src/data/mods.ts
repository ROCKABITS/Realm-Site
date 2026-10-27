export type Mod = {
  slug: string;
  name: string;
  label: string;
  version: string;
  category: string;
  image: string;
  description: string;
  story: string;
  features: string[];
  firstStep: string;
  integrations: string;
  folder: string;
  jar: string;
  featured?: boolean;
};

export const mods: Mod[] = [
  {
    slug: 'realm-origins', name: 'Realm Origins', label: 'Your story starts here', version: '0.5.7',
    category: 'Character & society', image: 'origins', featured: true,
    description: 'Give your character a name, a past, and a place in the world.',
    story: 'Every great story begins with someone. Create a roleplay character through a chapter-based introduction, then carry their history, achievements, and money in a parchment character book.',
    features: ['Chapter-based character creation with a live 3D portrait.', 'Custom occupation, personal history, and a drawn signature.', 'Roleplay names above players, in TAB, and in normal chat.', 'A character book, digital wallet, and currency exchange.'],
    firstStep: 'Create your character when prompted. Press P to open your character book afterwards.',
    integrations: 'Requires Origins 0.3.2 and Jupiter 2.3.7 for NeoForge. Origins: Classes 0.3 is optional. Replaces Chronicles RP; keep only one JAR.',
    folder: 'realm-origins', jar: 'realm-origins-0.5.7.jar',
  },
  {
    slug: 'realm-treasury', name: 'Realm Treasury', label: 'The wealth of a kingdom', version: '0.4.0',
    category: 'Economy & trade', image: 'treasury', featured: true,
    description: 'Build a public treasury with taxes, salaries, votes, and loans.',
    story: 'A kingdom needs more than a crown. Manage public funds, finance contracts, put proposals to a vote, and offer citizens loans with clear, fixed repayment terms.',
    features: ['A shared treasury with taxes, salaries, and a transaction history.', 'Public proposals, secret ballots, and funded kingdom benefits.', 'A physical loan counter with contracts and manual instalments.', 'Public contracts and integration with the wider Realm economy.'],
    firstStep: 'Place the treasury block or loan counter and interact with it. Management depends on the current government or an operator-appointed steward.',
    integrations: 'Formerly Crown Ledger; do not install both. Can use physical emeralds independently. Origins supplies a digital wallet; Council supplies the elected ruler.',
    folder: 'crown-ledger', jar: 'realm-treasury-0.4.0.jar',
  },
  {
    slug: 'realm-markets', name: 'Realm Markets', label: 'Open for business', version: '0.2.1',
    category: 'Economy & trade', image: 'markets', featured: true,
    description: 'Set up a medieval stall and let your shop work while you are away.',
    story: 'Turn a town square into a living marketplace. Build a crimson or green stall, stock real items, set a price, and collect your earnings when you return.',
    features: ['Two medieval stalls with the same trading features.', 'Real stock, per-item prices, and sales while the owner is offline.', 'Earnings stored at the stall until the owner collects them.', 'Optional sales tax paid to the public treasury.'],
    firstStep: 'Craft and place a stall, interact with it, then add stock and set the unit price.',
    integrations: 'Works with emeralds independently. New stalls can use the Origins wallet; Treasury adds sales tax. This version sells items without custom data.',
    folder: 'realm-markets', jar: 'realm-markets-0.2.1.jar',
  },
  {
    slug: 'realm-council', name: 'Realm Council', label: 'Let the kingdom decide', version: '0.2.2',
    category: 'Kingdom & justice', image: 'council', featured: true,
    description: 'Run for office, cast your vote, and swear an oath to the kingdom.',
    story: 'Give the people a voice. Physical election boards, ballot boxes, and an oath table turn government into something players take part in together.',
    features: ['Candidate registration, campaigns, ballots, and election results.', 'An oath ceremony before the elected ruler takes office.', 'Configurable election phases, eligibility, and terms.', 'Public government and election history.'],
    firstStep: 'An operator sets up an election using an election board. Citizens consult the board and vote at a ballot box.',
    integrations: 'Works independently. Origins supplies character details; Notifications supplies optional medieval HUD notices. Political office does not grant operator permissions.',
    folder: 'realm-council', jar: 'realmcouncil-0.2.2.jar',
  },
  {
    slug: 'contracts-bounties', name: 'Contracts & Bounties', label: 'A little work. A new adventure.', version: '0.4.0',
    category: 'Activities & rewards', image: 'contracts',
    description: 'Find work, post a contract, or take on your daily quests.',
    story: 'There is always something to do at the noticeboard. Supply another player, help fund a public project, or accept daily survival quests with rewards and reputation.',
    features: ['Three craftable noticeboard models.', 'Private and publicly funded material contracts.', 'Five daily quests: two easy, two medium, and one hard.', 'Reserved rewards, optional taxes, and reputation integration.'],
    firstStep: 'Place a noticeboard and interact with it. Accept a daily quest before making progress, or browse player contracts.',
    integrations: 'Origins supplies money and reputation; Treasury supplies public funding and tax policy. Material contracts have an emerald fallback. Quest emerald mode requires administrative configuration.',
    folder: 'contracts-bounties', jar: 'contracts-bounties-0.4.0.jar',
  },
  {
    slug: 'realm-identity', name: 'Realm Identity', label: 'Make it official', version: '0.1.2',
    category: 'Character & society', image: 'identity',
    description: 'Carry a signed document that tells the world who you are.',
    story: 'Your character deserves more than a name tag. Issue a physical identity document, sign it, and choose when to present it to another player.',
    features: ['A craftable writing desk and physical identity document.', 'Character details and signatures read from Origins.', 'Consent-based document presentation between players.', 'Current titles and optional marriage information.'],
    firstStep: 'Craft a writing desk and bring one paper and one ink sac to issue a document.',
    integrations: 'Works with account identity on its own. Origins supplies RP information, Titles supplies honours, and Marriage supplies civil status with privacy controls.',
    folder: 'realm-identity', jar: 'realm-identity-0.1.2.jar',
  },
  {
    slug: 'realm-economy', name: 'Realm Economy', label: 'Give every coin a purpose', version: '0.4.1',
    category: 'Economy & trade', image: 'economy',
    description: 'Bring the kingdom’s economy into everyday survival.',
    story: 'From a villager trade to a beacon activation, money becomes part of life in the kingdom. A physical Economy Desk lets the sworn President manage prices within administrative limits.',
    features: ['Wallet-based villager purchases and paid survival services.', 'Anvil, enchanting, smithing, brewing, and beacon mechanics.', 'A dedicated Economy Desk for public price policy.', 'Optional treasury payments and auditable economic activity.'],
    firstStep: 'Install Realm Origins and its dependencies first, then read the service guide before using paid workstations.',
    integrations: 'Uses Realm Origins 0.5.7. Treasury receives applicable taxes and Council identifies the President. Replaces Realm Villager Economy; remove the old JAR.',
    folder: 'realm-economy', jar: 'realm-economy-0.4.1.jar',
  },
  {
    slug: 'realm-titles', name: 'Realm Titles', label: 'An honour worth carrying', version: '0.1.0',
    category: 'Character & society', image: 'titles',
    description: 'Create honours and recognise the people who shape your kingdom.',
    story: 'Knight, Baron, Councillor — or something entirely your own. The Royal Seal Desk holds a public register of titles and the characters who have earned them.',
    features: ['Custom title names and descriptions.', 'Permanent appointments or terms of 1–365 real days.', 'A searchable public register and up to 16 titles per character.', 'Current honours displayed through Realm Identity.'],
    firstStep: 'Craft the Royal Seal Desk and interact with it to browse the public register.',
    integrations: 'Council controls who may manage appointments. Without Council, an operator designates a responsible person. Titles do not grant combat bonuses or administrative powers.',
    folder: 'realm-titles', jar: 'realm-titles-0.1.0.jar',
  },
  {
    slug: 'realm-marriage', name: 'Realm Marriage', label: 'Write your next chapter together', version: '0.1.0',
    category: 'Character & society', image: 'marriage',
    description: 'Celebrate a wedding with vows, witnesses, and a shared future.',
    story: 'Make a ceremony your community can be part of. Choose a celebrant, agree on your finances, invite witnesses, and exchange vows at a medieval wedding altar.',
    features: ['An engagement ring, a wedding altar, and invitations.', 'A chosen celebrant, witnesses, vows, and timed objections.', 'Three financial arrangements and supported shared-account operations.', 'Marriage certificates and agreement-based divorce settlement.'],
    firstStep: 'Use an engagement ring on another player. After acceptance, prepare and jointly approve your agreement at an altar.',
    integrations: 'Treasury can receive a ceremony fee. Identity can display civil status and validate a certificate. Other mods continue using personal wallets unless they explicitly support the shared-account API.',
    folder: 'realm-marriage', jar: 'realm-marriage-0.1.0.jar',
  },
  {
    slug: 'laws-justice', name: 'Laws & Justice', label: 'Every kingdom needs its laws', version: '0.4.0',
    category: 'Kingdom & justice', image: 'justice',
    description: 'Bring courts, evidence, warrants, and prison sentences into roleplay.',
    story: 'Build the institutions your story needs. Players construct prisons and courts, while judicial decisions, community work, fines, and bail become part of the kingdom’s public life.',
    features: ['Player-built prisons, registered cells, and online-only sentences.', 'Court cases, evidence, hearings, warrants, and handcuffs.', 'Six prison jobs with configurable sentence reduction.', 'Fines, bail, a public register, and persistent payment receipts.'],
    firstStep: 'Build a prison and register its cells. Judicial actions are performed through the mod’s physical blocks and authorised roles.',
    integrations: 'Works independently. Council supplies the sworn President, Origins supplies digital payment, and Treasury receives judicial funds. No prisons are generated automatically.',
    folder: 'laws-justice', jar: 'laws-justice-0.4.0.jar',
  },
  {
    slug: 'realm-casino', name: 'Realm Casino', label: 'An evening at the tables', version: '0.3.0',
    category: 'Activities & rewards', image: 'casino',
    description: 'Build a medieval casino with twelve physical games.',
    story: 'Wood, velvet, brass, and a little anticipation. Create a casino with working machines, miniature horse races, and multiplayer card tables powered by in-game currency.',
    features: ['Twelve games, including roulette, slots, Plinko, and poker.', 'Miniature horse races and animated physical game pieces.', 'Multiplayer tables with private cards and funded stakes.', 'Owner-managed bankrolls and optional tax on withdrawn profit.'],
    firstStep: 'Craft a game block and read its rules before playing. Betting requires the Origins digital wallet.',
    integrations: 'Uses the Origins wallet for virtual stakes. Treasury can receive tax on the owner’s withdrawn profit. Game rules and odds are documented in the source guide.',
    folder: 'realm-casino', jar: 'realm-casino-0.3.0.jar',
  },
  {
    slug: 'realm-rewards', name: 'Realm Rewards', label: 'Make progress count', version: '0.1.2',
    category: 'Activities & rewards', image: 'rewards',
    description: 'Earn in-game money for the milestones you reach.',
    story: 'Give exploration and achievement a place in the economy. New vanilla and modded advancements can reward players automatically, with configurable values and persistent payment tracking.',
    features: ['Automatic rewards for newly completed advancements.', 'Configurable rewards by advancement and advancement type.', 'One payment per achievement per player.', 'Pending payments retained when a wallet is unavailable.'],
    firstStep: 'Players earn rewards automatically. Operators use /rewards to configure values.',
    integrations: 'Origins supplies the wallet. Without an available wallet, payments remain pending. Notifications supplies optional HUD notices. Existing completed advancements are not paid retroactively.',
    folder: 'realm-rewards', jar: 'realm-rewards-0.1.2.jar',
  },
  {
    slug: 'realm-notifications', name: 'Realm Notifications', label: 'News from your world', version: '0.1.1',
    category: 'Activities & rewards', image: 'notifications',
    description: 'Keep up with kingdom life through medieval on-screen notices.',
    story: 'A completed contract, a successful sale, an election result. Bring confirmed events together in a parchment-inspired HUD with your own preferences and a private session journal.',
    features: ['Medieval HUD notices for supported companion mods.', 'Personal position, duration, sound, and visibility preferences.', 'A private session journal opened with N.', 'Grouped arrival notices to reduce bursts of messages.'],
    firstStep: 'Press N to open the journal and preferences. Gameplay menus still open at their own blocks.',
    integrations: 'Companion integrations are optional. Players without the optional channel retain supported chat messages. Notices report completed events; they do not decide payments or permissions.',
    folder: 'realm-notifications', jar: 'realm-notifications-0.1.1.jar',
  },
];

export const getMod = (slug: string) => mods.find(mod => mod.slug === slug);
export const sourceUrl = (mod: Mod) => `https://github.com/ROCKABITS/Mods/tree/main/${mod.folder}`;
export const downloadUrl = (mod: Mod) => `https://github.com/ROCKABITS/Mods/raw/refs/heads/main/mod-pronto/${mod.jar}`;
