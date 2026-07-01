import "../config/env";
import { db } from "./index";
import { cities, users, zones, districts, streets } from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../services/auth.service";

async function seed() {
  console.log("🌱 Seeding FieldTrack KSA database…");

  // ── Cities ────────────────────────────────────────────────────────────────
  const [jeddah, riyadh, dammam, makkah] = await db
    .insert(cities)
    .values([
      { nameEn: "Jeddah", nameAr: "جدة", regionEn: "Makkah Region", centerLat: "21.4858", centerLng: "39.1925", estimatedNamedStreets: 10480 },
      { nameEn: "Riyadh", nameAr: "الرياض", regionEn: "Riyadh Region", centerLat: "24.7136", centerLng: "46.6753", estimatedNamedStreets: 14200 },
      { nameEn: "Dammam", nameAr: "الدمام", regionEn: "Eastern Province", centerLat: "26.4207", centerLng: "50.0888", estimatedNamedStreets: 7600 },
      { nameEn: "Makkah", nameAr: "مكة المكرمة", regionEn: "Makkah Region", centerLat: "21.3891", centerLng: "39.8579", estimatedNamedStreets: 6800 },
    ])
    .returning()
    .onConflictDoNothing();

  console.log("✅ Cities seeded");

  // ── Admin ─────────────────────────────────────────────────────────────────
  await db
    .insert(users)
    .values({
      fullName: "Super Admin",
      email: "admin@fieldtrack.sa",
      passwordHash: await hashPassword("Admin1234"),
      role: "super_admin",
    })
    .onConflictDoNothing();

  // ── Drivers ───────────────────────────────────────────────────────────────
  const defaultPass = await hashPassword("Driver1234");
  await db
    .insert(users)
    .values([
      { fullName: "Ahmed Al-Rashid", phone: "+966501234567", passwordHash: defaultPass, role: "driver", cityId: jeddah?.id },
      { fullName: "Mohammed Al-Otaibi", phone: "+966502345678", passwordHash: defaultPass, role: "driver", cityId: jeddah?.id },
      { fullName: "Khalid Al-Ghamdi", phone: "+966503456789", passwordHash: defaultPass, role: "driver", cityId: jeddah?.id },
      { fullName: "Abdullah Al-Zahrani", phone: "+966504567890", passwordHash: defaultPass, role: "driver", cityId: jeddah?.id },
      { fullName: "Omar Al-Shehri", phone: "+966505678901", passwordHash: defaultPass, role: "driver", cityId: jeddah?.id },
      { fullName: "Fahad Al-Malki", phone: "+966506789012", passwordHash: defaultPass, role: "driver", cityId: jeddah?.id },
      { fullName: "Yousef Al-Harbi", phone: "+966507779012", passwordHash: defaultPass, role: "driver", cityId: riyadh?.id },
      { fullName: "Saad Al-Qahtani", phone: "+966508889012", passwordHash: defaultPass, role: "driver", cityId: riyadh?.id },
      { fullName: "Nasser Al-Mutairi", phone: "+966509999012", passwordHash: defaultPass, role: "driver", cityId: riyadh?.id },
      { fullName: "Bader Al-Anazi", phone: "+966501019012", passwordHash: defaultPass, role: "driver", cityId: dammam?.id },
      { fullName: "Turki Al-Subaie", phone: "+966502029012", passwordHash: defaultPass, role: "driver", cityId: dammam?.id },
      { fullName: "Hassan Al-Bishi", phone: "+966503039012", passwordHash: defaultPass, role: "driver", cityId: makkah?.id },
    ])
    .onConflictDoNothing();

  // ── City Managers ─────────────────────────────────────────────────────────
  const managerPass = await hashPassword("Manager1234");
  await db
    .insert(users)
    .values([
      { fullName: "Jeddah Manager", email: "manager.jeddah@fieldtrack.sa", passwordHash: managerPass, role: "city_manager", cityId: jeddah?.id },
      { fullName: "Riyadh Manager", email: "manager.riyadh@fieldtrack.sa", passwordHash: managerPass, role: "city_manager", cityId: riyadh?.id },
    ])
    .onConflictDoNothing();

  console.log("✅ Users + Drivers seeded");

  // ── Zones + Districts (Jeddah sample) ────────────────────────────────────
  if (jeddah) {
    const [northJeddah, centralJeddah, southJeddah] = await db
      .insert(zones)
      .values([
        { cityId: jeddah.id, nameEn: "North Jeddah", nameAr: "شمال جدة" },
        { cityId: jeddah.id, nameEn: "Central Jeddah", nameAr: "وسط جدة" },
        { cityId: jeddah.id, nameEn: "South Jeddah", nameAr: "جنوب جدة" },
      ])
      .returning();

    const [alSalamah, alZahra, alRawdah, alHamra, alBasateen] = await db.insert(districts).values([
      { cityId: jeddah.id, zoneId: northJeddah.id, nameEn: "Al Salamah", nameAr: "السلامة", centerLat: "21.5425", centerLng: "39.1728" },
      { cityId: jeddah.id, zoneId: northJeddah.id, nameEn: "Al Zahra", nameAr: "الزهراء", centerLat: "21.5312", centerLng: "39.1855" },
      { cityId: jeddah.id, zoneId: centralJeddah.id, nameEn: "Al Rawdah", nameAr: "الروضة", centerLat: "21.4958", centerLng: "39.1832" },
      { cityId: jeddah.id, zoneId: southJeddah.id, nameEn: "Al Hamra", nameAr: "الحمراء", centerLat: "21.4750", centerLng: "39.1580" },
      { cityId: jeddah.id, zoneId: southJeddah.id, nameEn: "Al Basateen", nameAr: "البساتين", centerLat: "21.4620", centerLng: "39.2010" },
    ]).returning();

    // Streets
    await db.insert(streets).values([
      { cityId: jeddah.id, districtId: alSalamah.id, nameEn: "Prince Sultan Road", nameAr: "طريق الأمير سلطان" },
      { cityId: jeddah.id, districtId: alSalamah.id, nameEn: "Hira Street", nameAr: "شارع حراء" },
      { cityId: jeddah.id, districtId: alSalamah.id, nameEn: "Al Andalus Street", nameAr: "شارع الأندلس" },
      { cityId: jeddah.id, districtId: alZahra.id, nameEn: "Tahlia Street", nameAr: "شارع التحلية" },
      { cityId: jeddah.id, districtId: alZahra.id, nameEn: "Al Rawdah Street", nameAr: "شارع الروضة" },
      { cityId: jeddah.id, districtId: alZahra.id, nameEn: "Palestine Street", nameAr: "شارع فلسطين" },
      { cityId: jeddah.id, districtId: alRawdah.id, nameEn: "King Abdulaziz Road", nameAr: "طريق الملك عبدالعزيز" },
      { cityId: jeddah.id, districtId: alRawdah.id, nameEn: "Madinah Road", nameAr: "طريق المدينة" },
      { cityId: jeddah.id, districtId: alHamra.id, nameEn: "Al Corniche Road", nameAr: "طريق الكورنيش" },
      { cityId: jeddah.id, districtId: alHamra.id, nameEn: "Al Hamra Street", nameAr: "شارع الحمراء" },
      { cityId: jeddah.id, districtId: alBasateen.id, nameEn: "King Fahd Road", nameAr: "طريق الملك فهد" },
      { cityId: jeddah.id, districtId: alBasateen.id, nameEn: "Al Basateen Main Street", nameAr: "شارع البساتين الرئيسي" },
    ]);

    // Update Jeddah districts with polygon boundaries
    const jeddahBoundaries: Record<string, [number, number][]> = {
      [alSalamah.id]: [[21.548,39.165],[21.548,39.182],[21.537,39.182],[21.537,39.165]],
      [alZahra.id]: [[21.537,39.178],[21.537,39.195],[21.526,39.195],[21.526,39.178]],
      [alRawdah.id]: [[21.502,39.175],[21.502,39.192],[21.490,39.192],[21.490,39.175]],
      [alHamra.id]: [[21.481,39.148],[21.481,39.168],[21.469,39.168],[21.469,39.148]],
      [alBasateen.id]: [[21.469,39.192],[21.469,39.212],[21.456,39.212],[21.456,39.192]],
    };
    for (const [distId, boundary] of Object.entries(jeddahBoundaries)) {
      await db.update(districts).set({ boundary }).where(eq(districts.id, distId));
    }
  }

  // ── Zones + Districts + Streets (Riyadh) ─────────────────────────────────
  if (riyadh) {
    const [northRiyadh, centralRiyadh, eastRiyadh, southRiyadh] = await db
      .insert(zones)
      .values([
        { cityId: riyadh.id, nameEn: "North Riyadh", nameAr: "شمال الرياض" },
        { cityId: riyadh.id, nameEn: "Central Riyadh", nameAr: "وسط الرياض" },
        { cityId: riyadh.id, nameEn: "East Riyadh", nameAr: "شرق الرياض" },
        { cityId: riyadh.id, nameEn: "South Riyadh", nameAr: "جنوب الرياض" },
      ])
      .returning();

    const [alNakheel, alYasmin, alMalqa, alOlaya, alMuruj, alSulimaniyah, alRabi, gharnata, alAziziyah, alShifa] = await db.insert(districts).values([
      // North Riyadh
      { cityId: riyadh.id, zoneId: northRiyadh.id, nameEn: "Al Nakheel", nameAr: "النخيل", centerLat: "24.7920", centerLng: "46.6270",
        boundary: [[24.798,46.618],[24.798,46.636],[24.786,46.636],[24.786,46.618]] },
      { cityId: riyadh.id, zoneId: northRiyadh.id, nameEn: "Al Yasmin", nameAr: "الياسمين", centerLat: "24.8230", centerLng: "46.6380",
        boundary: [[24.830,46.628],[24.830,46.648],[24.816,46.648],[24.816,46.628]] },
      { cityId: riyadh.id, zoneId: northRiyadh.id, nameEn: "Al Malqa", nameAr: "الملقا", centerLat: "24.8450", centerLng: "46.6150",
        boundary: [[24.853,46.605],[24.853,46.625],[24.837,46.625],[24.837,46.605]] },
      // Central Riyadh
      { cityId: riyadh.id, zoneId: centralRiyadh.id, nameEn: "Al Olaya", nameAr: "العليا", centerLat: "24.6940", centerLng: "46.6850",
        boundary: [[24.702,46.676],[24.702,46.694],[24.686,46.694],[24.686,46.676]] },
      { cityId: riyadh.id, zoneId: centralRiyadh.id, nameEn: "Al Muruj", nameAr: "المروج", centerLat: "24.7350", centerLng: "46.6600",
        boundary: [[24.742,46.651],[24.742,46.669],[24.728,46.669],[24.728,46.651]] },
      { cityId: riyadh.id, zoneId: centralRiyadh.id, nameEn: "Al Sulimaniyah", nameAr: "السليمانية", centerLat: "24.7100", centerLng: "46.6750",
        boundary: [[24.718,46.667],[24.718,46.683],[24.702,46.683],[24.702,46.667]] },
      // East Riyadh
      { cityId: riyadh.id, zoneId: eastRiyadh.id, nameEn: "Al Rabi", nameAr: "الربيع", centerLat: "24.7680", centerLng: "46.7250",
        boundary: [[24.776,46.716],[24.776,46.734],[24.760,46.734],[24.760,46.716]] },
      { cityId: riyadh.id, zoneId: eastRiyadh.id, nameEn: "Gharnata", nameAr: "غرناطة", centerLat: "24.7450", centerLng: "46.7400",
        boundary: [[24.753,46.731],[24.753,46.749],[24.737,46.749],[24.737,46.731]] },
      // South Riyadh
      { cityId: riyadh.id, zoneId: southRiyadh.id, nameEn: "Al Aziziyah", nameAr: "العزيزية", centerLat: "24.6200", centerLng: "46.7050",
        boundary: [[24.628,46.696],[24.628,46.714],[24.612,46.714],[24.612,46.696]] },
      { cityId: riyadh.id, zoneId: southRiyadh.id, nameEn: "Al Shifa", nameAr: "الشفاء", centerLat: "24.5850", centerLng: "46.7150",
        boundary: [[24.593,46.706],[24.593,46.724],[24.577,46.724],[24.577,46.706]] },
    ]).returning();

    // Streets for Riyadh districts
    await db.insert(streets).values([
      // Al Nakheel
      { cityId: riyadh.id, districtId: alNakheel.id, nameEn: "Al Nakheel Boulevard", nameAr: "بوليفارد النخيل" },
      { cityId: riyadh.id, districtId: alNakheel.id, nameEn: "Prince Turki Street", nameAr: "شارع الأمير تركي" },
      { cityId: riyadh.id, districtId: alNakheel.id, nameEn: "Al Thumama Road", nameAr: "طريق الثمامة" },
      { cityId: riyadh.id, districtId: alNakheel.id, nameEn: "Al Noor Street", nameAr: "شارع النور" },
      // Al Yasmin
      { cityId: riyadh.id, districtId: alYasmin.id, nameEn: "Al Yasmin Main Road", nameAr: "طريق الياسمين الرئيسي" },
      { cityId: riyadh.id, districtId: alYasmin.id, nameEn: "Prince Mohammed Bin Salman Road", nameAr: "طريق الأمير محمد بن سلمان" },
      { cityId: riyadh.id, districtId: alYasmin.id, nameEn: "Al Ward Street", nameAr: "شارع الورد" },
      // Al Malqa
      { cityId: riyadh.id, districtId: alMalqa.id, nameEn: "King Salman Road", nameAr: "طريق الملك سلمان" },
      { cityId: riyadh.id, districtId: alMalqa.id, nameEn: "Al Malqa Avenue", nameAr: "شارع الملقا الرئيسي" },
      { cityId: riyadh.id, districtId: alMalqa.id, nameEn: "Anas Ibn Malik Road", nameAr: "طريق أنس بن مالك" },
      // Al Olaya
      { cityId: riyadh.id, districtId: alOlaya.id, nameEn: "Olaya Street", nameAr: "شارع العليا" },
      { cityId: riyadh.id, districtId: alOlaya.id, nameEn: "King Fahd Road", nameAr: "طريق الملك فهد" },
      { cityId: riyadh.id, districtId: alOlaya.id, nameEn: "Tahlia Street", nameAr: "شارع التحلية" },
      { cityId: riyadh.id, districtId: alOlaya.id, nameEn: "Al Urubah Road", nameAr: "طريق العروبة" },
      // Al Muruj
      { cityId: riyadh.id, districtId: alMuruj.id, nameEn: "Al Muruj Main Street", nameAr: "شارع المروج الرئيسي" },
      { cityId: riyadh.id, districtId: alMuruj.id, nameEn: "Abu Bakr Al Siddiq Road", nameAr: "طريق أبو بكر الصديق" },
      { cityId: riyadh.id, districtId: alMuruj.id, nameEn: "Al Imam Saud Street", nameAr: "شارع الإمام سعود" },
      // Al Sulimaniyah
      { cityId: riyadh.id, districtId: alSulimaniyah.id, nameEn: "Al Imam Turki Street", nameAr: "شارع الإمام تركي" },
      { cityId: riyadh.id, districtId: alSulimaniyah.id, nameEn: "Al Dabab Street", nameAr: "شارع الدباب" },
      { cityId: riyadh.id, districtId: alSulimaniyah.id, nameEn: "King Abdulaziz Road", nameAr: "طريق الملك عبدالعزيز" },
      // Al Rabi
      { cityId: riyadh.id, districtId: alRabi.id, nameEn: "Al Rabi Street", nameAr: "شارع الربيع" },
      { cityId: riyadh.id, districtId: alRabi.id, nameEn: "Saad Ibn Abi Waqqas Street", nameAr: "شارع سعد بن أبي وقاص" },
      { cityId: riyadh.id, districtId: alRabi.id, nameEn: "Al Sahafa Street", nameAr: "شارع الصحافة" },
      // Gharnata
      { cityId: riyadh.id, districtId: gharnata.id, nameEn: "Makkah Al Mukarramah Road", nameAr: "طريق مكة المكرمة" },
      { cityId: riyadh.id, districtId: gharnata.id, nameEn: "Eastern Ring Road", nameAr: "الطريق الدائري الشرقي" },
      { cityId: riyadh.id, districtId: gharnata.id, nameEn: "Gharnata Street", nameAr: "شارع غرناطة" },
      // Al Aziziyah
      { cityId: riyadh.id, districtId: alAziziyah.id, nameEn: "Al Aziziyah Main Road", nameAr: "طريق العزيزية الرئيسي" },
      { cityId: riyadh.id, districtId: alAziziyah.id, nameEn: "Al Kharj Road", nameAr: "طريق الخرج" },
      { cityId: riyadh.id, districtId: alAziziyah.id, nameEn: "Al Jazeera Street", nameAr: "شارع الجزيرة" },
      // Al Shifa
      { cityId: riyadh.id, districtId: alShifa.id, nameEn: "Al Shifa Main Street", nameAr: "شارع الشفاء الرئيسي" },
      { cityId: riyadh.id, districtId: alShifa.id, nameEn: "Dirab Road", nameAr: "طريق ديراب" },
      { cityId: riyadh.id, districtId: alShifa.id, nameEn: "Al Imam Road", nameAr: "طريق الإمام" },
    ]);
  }

  console.log("✅ Zones + Districts + Streets seeded (Jeddah + Riyadh)");
  console.log("\n🎉 Seed complete!");
  console.log("   Admin login:   admin@fieldtrack.sa / Admin1234");
  console.log("   Manager login: manager.jeddah@fieldtrack.sa / Manager1234");
  console.log("   Driver login:  +966501234567 / Driver1234");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
