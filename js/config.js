(function () {
  "use strict";

  const ranks = [
    { id: "leadership", order: 1, name: "Leadership" },
    { id: "directorship", order: 2, name: "Directorship" },
    { id: "senior-management", order: 3, name: "Senior Management" },
    { id: "management", order: 4, name: "Management" },
    { id: "supervision", order: 5, name: "Supervision" },
    { id: "administration", order: 6, name: "Administration" },
    { id: "moderation", order: 7, name: "Moderation" },
  ];

  window.FSRP_DEFAULT_CONTENT = {
    version: 3,
    notice: {
      enabled: true,
      label: "Website Update",
      text: "The Florida State Roleplay Community Hub has been modernized for faster loading and easier navigation.",
    },
    hero: {
      title1: "Florida State",
      title2: "Roleplay.",
      subtitle: "Where Florida comes alive in ER:LC — organized sessions, professional departments, unforgettable scenes, and a community built to leave a legacy.",
      primaryLabel: "Join Florida State Roleplay",
      primaryUrl: "https://discord.com/fosrp",
      backgroundUrl: "",
    },
    links: {
      discord: "https://discord.com/fosrp",
      roblox: "https://www.roblox.com/communities/219522276",
      youtube: "https://www.youtube.com/channel/UCapQbvZpNgdIwbFh09WNKOw",
      tiktok: "https://www.tiktok.com/@floridastateroleplayprc",
      instagram: "https://www.instagram.com/floridastateroleplay23/",
    },
    status: {
      session: "Server Offline",
      players: "",
      queue: "",
      priority: "Unavailable",
      code: "",
      message: "The server is not currently marked active. Watch official announcements for the next session startup.",
      updatedBy: "FSRP Leadership",
      updatedAt: "",
    },
    theme: {
      cyan: "#43c7f1",
      gold: "#d9a23a",
    },
    features: {
      community: true,
      dashboard: true,
      departments: true,
      platform: true,
      staff: true,
      marketplace: true,
      rules: true,
      support: true,
    },
    maintenance: {
      enabled: false,
      title: "Community Hub maintenance",
      message: "Florida State Roleplay is applying an official website update. Use Discord for current session and support information.",
    },
    sound: {
      defaultEnabled: "false",
      volume: "0.25",
      clickUrl: "",
    },
    departments: [
      { id: "fhp", code: "FHP", name: "Florida Highway Patrol", category: "law", status: "Active", image: "/assets/brand/fhp.png", description: "Highway patrol, traffic enforcement, DUI operations, crash investigations, and statewide interdiction.", requirements: "Complete verification and the official department application when open.", link: "https://discord.com/fosrp", published: true },
      { id: "ocso", code: "OCSO", name: "Orange County Sheriff's Office", category: "law", status: "Active", image: "/assets/brand/ocso.png", description: "County patrol, community policing, criminal investigations, warrant service, and prisoner transport.", requirements: "Complete verification and the official department application when open.", link: "https://discord.com/fosrp", published: true },
      { id: "ffw", code: "FFW", name: "Florida Fish & Wildlife", category: "law", status: "Training", image: "/assets/brand/ffw.png", description: "Wildlife enforcement, marine patrol, boating safety, conservation, hunting regulation, and search and rescue.", requirements: "Complete verification and the official department application when open.", link: "https://discord.com/fosrp", published: true },
      { id: "fbi", code: "FBI", name: "Federal Bureau of Investigation", category: "federal", status: "Restricted", image: "/assets/brand/fbi.png", description: "Major criminal investigations, intelligence operations, federal warrants, and joint-agency scenes.", requirements: "Access is controlled by federal leadership and official application requirements.", link: "https://discord.com/fosrp", published: true },
      { id: "civ", code: "CIV", name: "Civilian Operations", category: "civilian", status: "Active", image: "/assets/brand/civ.png", description: "Businesses, careers, vehicles, legal activity, criminal stories, and community-driven roleplay.", requirements: "Join an official session and follow all civilian roleplay standards.", link: "https://discord.com/fosrp", published: true },
    ],
    ranks,
    staff: [
      { id: "swagg925pj", discordUserId: "", username: "@Swagg925PJ", displayName: "Swagg925PJ", avatarUrl: "", rankId: "moderation", positionTitle: "Moderation", department: "Community Staff", callsign: "", bio: "Published member of the Florida State Roleplay moderation team.", presenceStatus: "unavailable", statusMessage: "", published: true, customOrder: 1 },
    ],
    announcements: [
      { id: "launch", title: "Florida State Roleplay is live", body: "The Florida revamp has launched. Official session startups, community notices, and important changes are published through the FSRP Discord and this hub.", category: "announcement", priority: "featured", date: "2026-07-28", published: true },
      { id: "v3", title: "Community Hub V3 modernization", body: "The website is being reorganized into focused pages with integrated search, notifications, faster loading, and a browser-based management system.", category: "website", priority: "normal", date: "2026-07-29", published: true },
    ],
    events: [],
    timeline: [
      { id: "launch-2026", date: "July 2026", title: "Florida State Roleplay launch", body: "The Florida revamp moved into its official launch phase with updated community systems and branding.", published: true },
      { id: "hub-v3", date: "July 2026", title: "Community Hub V3", body: "The website received a performance-first rebuild with modular files, focused navigation, search, notifications, and manager controls.", published: true },
    ],
    marketplace: [
      { id: "supporter", tag: "Most Popular", name: "FSRP Supporter", description: "Support the community and receive the official supporter role plus recognition and early project updates.", benefits: ["Supporter Discord role", "Community recognition", "Early revamp updates"], buttonLabel: "Open Marketplace", buttonUrl: "https://discord.com/fosrp", featured: true, published: true },
      { id: "priority", tag: "Access", name: "Priority Access", description: "Priority benefits will only be shown as available after leadership publishes final details.", benefits: ["Official session benefits", "Special event access", "Marketplace support"], buttonLabel: "View in Discord", buttonUrl: "https://discord.com/fosrp", featured: false, published: true },
      { id: "promotion", tag: "Community", name: "Community Promotion", description: "Partnership, advertisement, creator, and sponsored event requests are reviewed through official support.", benefits: ["Approved advertisements", "Sponsored giveaways", "Staff-managed promotion"], buttonLabel: "Open a Ticket", buttonUrl: "https://discord.com/fosrp", featured: false, published: true },
    ],
    rules: [
      { id: "conduct", number: "01", title: "Community Conduct", items: ["Respect members, staff, departments, and partners.", "No harassment, discrimination, threats, trolling, or targeted disruption.", "No impersonating staff, departments, or whitelisted ranks.", "No inappropriate usernames, avatars, messages, or filter bypassing."], published: true },
      { id: "roleplay", number: "02", title: "Roleplay Standards", items: ["No RDM, VDM, mass RDM, mass VDM, or random attacks.", "No fail roleplay, NITRP, cop baiting, cuff rushing, or tool abuse.", "Follow Fear Roleplay and New Life Rule expectations.", "Do not enter or interfere with scenes without a valid roleplay reason."], published: true },
      { id: "vehicles", number: "03", title: "Vehicles & Driving", items: ["Use approved vehicles, liveries, and emergency equipment.", "No GTA driving, unrealistic speeds, vehicle ramming, or vehicle abuse.", "Do not tow, block, or damage staff vehicles during moderation scenes.", "Follow traffic laws unless a valid roleplay situation requires otherwise."], published: true },
      { id: "equipment", number: "04", title: "Uniforms & Equipment", items: ["Use approved uniforms, callsigns, liveries, and tools.", "No banned vehicles, avatars, or glitch accessories.", "Department equipment must only be used for official duties.", "Custom assets must follow department and server standards."], published: true },
      { id: "priority", number: "05", title: "Priority & Scenes", items: ["Respect the priority timer and current priority status.", "Do not begin major scenes during cooldown or restricted status.", "Sensitive roleplays require staff approval before they begin.", "Follow safe-zone restrictions and active scene boundaries."], published: true },
      { id: "staff", number: "06", title: "Staff Interactions", items: ["Do not interfere with, evade, or leave an active moderation scene.", "Answer staff honestly and provide evidence when requested.", "No lying to staff, staff evasion, or early rejoining after a kick.", "Use reports and appeals instead of arguing inside the session."], published: true },
      { id: "safety", number: "07", title: "Platform Safety", items: ["Follow Roblox and Discord rules at all times.", "No exploiting, bug abuse, account compromise, or malicious links.", "Never share private information or pressure others to share it.", "Report serious safety concerns directly to leadership."], published: true },
      { id: "sessions", number: "08", title: "Session Compliance", items: ["Join only after an official session announcement.", "Follow SSU, SSD, restart, queue, and server-full instructions.", "Leave promptly during shutdown unless staff instruct otherwise.", "Repeated disruption may restrict access to future sessions."], published: true },
    ],
    gallery: [
      { id: "fsrp-brand", type: "image", url: "/assets/brand/social-preview.png", title: "Florida State Roleplay", category: "Community", featured: true, published: true },
      { id: "fhp-brand", type: "image", url: "/assets/brand/fhp.png", title: "Florida Highway Patrol", category: "Departments", featured: false, published: true },
      { id: "ocso-brand", type: "image", url: "/assets/brand/ocso.png", title: "Orange County Sheriff's Office", category: "Departments", featured: false, published: true },
    ],
    systems: [
      { id: "cad", icon: "CAD", title: "Computer Aided Dispatch", body: "Organized records and operations tools support immersive law-enforcement, fire, civilian, and justice scenes.", published: true },
      { id: "automation", icon: "BOT", title: "Discord Automation", body: "Session tools, applications, tickets, moderation records, department workflows, and role automation stay connected.", published: true },
      { id: "justice", icon: "LAW", title: "Justice System", body: "Citations, jail records, warrants, court cases, government roles, and federal operations create longer stories.", published: true },
      { id: "sessions", icon: "SSU", title: "Session Operations", body: "Startup, full-server, restart, crash, shutdown, queue, priority, and status workflows are organized for members.", published: true },
      { id: "policy", icon: "DOC", title: "Policy Manuals", body: "Community rules, roleplay standards, staff ethics, department requirements, and appeals are documented clearly.", published: true },
      { id: "assets", icon: "ART", title: "Custom Assets", body: "Official liveries, uniforms, emblems, media, and website branding give every department a recognizable identity.", published: true },
    ],
    joinSteps: [
      { id: "join-discord", number: "01", title: "Join the Discord", body: "Enter the official community, complete verification, and read the current announcements and rules.", published: true },
      { id: "choose-path", number: "02", title: "Choose Your Path", body: "Explore public departments, civilian operations, staff opportunities, applications, and support resources.", published: true },
      { id: "enter-session", number: "03", title: "Enter the Session", body: "Watch for an official SSU, follow the status page, join correctly, and build a high-quality roleplay story.", published: true },
    ],
    faqs: [
      { id: "what-is-fsrp", question: "What is Florida State Roleplay?", answer: "FSRP is an independent ER:LC roleplay community focused on organized sessions, professional departments, consistent moderation, and community-driven stories.", published: true },
      { id: "how-join", question: "How do I join an official session?", answer: "Join the official Discord, complete verification, read the rules, and wait for a Session Startup announcement. Mission Control displays the latest leadership-published status.", published: true },
      { id: "apply", question: "How do department applications work?", answer: "Application availability and requirements are controlled by department leadership. Use the Departments and Support pages for the current official path.", published: true },
      { id: "status", question: "Why does some information say Unavailable?", answer: "FSRP does not invent live numbers or presence. When a source is not connected or has not confirmed a value, the website displays an honest unavailable state.", published: true },
      { id: "support", question: "Where do I report a problem or appeal an action?", answer: "Open the Support Center and select the correct report, appeal, application, purchase, or general-assistance path.", published: true },
    ],
    support: [
      { id: "general", icon: "?", title: "Questions & Assistance", body: "Verification, roles, website questions, server access, and general community help.", label: "Open Support", url: "https://discord.com/fosrp", published: true },
      { id: "departments", icon: "◇", title: "Applications & Careers", body: "Application status, department questions, transfers, training, and rank concerns.", label: "Department Support", url: "https://discord.com/fosrp", published: true },
      { id: "reports", icon: "!", title: "Member or Staff Reports", body: "Submit clear details and evidence. False or retaliatory reports are prohibited.", label: "Open Report", url: "https://discord.com/fosrp", published: true },
      { id: "appeals", icon: "↺", title: "Warnings, Kicks & Bans", body: "Request a fair review with the action, explanation, and available evidence.", label: "Open Appeal", url: "https://discord.com/fosrp", published: true },
      { id: "purchase", icon: "$", title: "Marketplace Assistance", body: "Delivery problems, role benefits, transaction questions, and approved purchase concerns.", label: "Purchase Support", url: "https://discord.com/fosrp", published: true },
      { id: "partners", icon: "↗", title: "Media & Collaboration", body: "Partnership applications, content creators, advertisements, and sponsored events.", label: "Partnership Support", url: "https://discord.com/fosrp", published: true },
    ],
    assets: [],
  };

  window.FSRP_SITE_MAP = [
    { page: "home", label: "Home", description: "Official Florida State Roleplay landing page", icon: "⌂", keywords: "join florida roleplay" },
    { page: "community", label: "Community Hub", description: "Announcements, events, media, and updates", icon: "◎", keywords: "news timeline event" },
    { page: "dashboard", label: "Server Status", description: "Mission Control, session, queue, and player status", icon: "⌁", keywords: "status ssu server queue players" },
    { page: "departments", label: "Departments", description: "FHP, OCSO, FFW, FBI, and Civilian Operations", icon: "◇", keywords: "police sheriff fish wildlife federal civilian" },
    { page: "platform", label: "Community Platform", description: "Systems, onboarding, policies, and frequently asked questions", icon: "⌘", keywords: "cad bot justice sessions policy assets join faq" },
    { page: "staff", label: "Chain of Command", description: "Staff hierarchy and published directory", icon: "♙", keywords: "staff leadership management moderation" },
    { page: "marketplace", label: "Marketplace", description: "Official community benefits and support", icon: "$", keywords: "supporter priority promotion" },
    { page: "rules", label: "Rules & Policies", description: "Community and roleplay standards", icon: "§", keywords: "rdm vdm frp conduct driving uniforms" },
    { page: "support", label: "Support Center", description: "Applications, tickets, reports, and appeals", icon: "?", keywords: "help ticket report appeal application" },
    { page: "manager", label: "Website Manager", description: "Authorized content management", icon: "⚙", keywords: "admin edit cms" },
  ];
})();
