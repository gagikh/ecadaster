/**
 * Marz -> communities, and Armenian -> [English, Russian] place names.
 * Shared by the map (index.html) and the statistics page (stats.html) so a
 * translation only ever has to be added in one place.
 */
var PLACE = {
  "Արագածոտն":["Aragatsotn","Арагацотн"],
  "Ալագյազ":["Alagyaz","Алагяз"],
  "Աշտարակ":["Ashtarak","Аштарак"],
  "Ապարան":["Aparan","Апаран"],
  "Արևուտ":["Arevut","Аревут"],
  "Թալին":["Talin","Талин"],
  "Ծաղկահովիտ":["Tsaghkahovit","Цахкаовит"],
  "Մեծաձոր":["Metsadzor","Мецадзор"],
  "Շամիրամ":["Shamiram","Шамирам"],
  "Արարատ":["Ararat","Арарат"],
  "Արտաշատ":["Artashat","Арташат"],
  "Մասիս":["Masis","Масис"],
  "Վեդի":["Vedi","Веди"],
  "Վերին Դվին":["Verin Dvin","Верин Двин"],
  "Արմավիր":["Armavir","Армавир"],
  "Արաքս":["Araks","Аракс"],
  "Բաղրամյան":["Baghramyan","Баграмян"],
  "Մեծամոր":["Metsamor","Мецамор"],
  "Վաղարշապատ":["Vagharshapat","Вагаршапат"],
  "Փարաքար":["Parakar","Паракар"],
  "Ֆերիկ":["Ferik","Ферик"],
  "Գեղարքունիք":["Gegharkunik","Гегаркуник"],
  "Գավառ":["Gavar","Гавар"],
  "Ճամբարակ":["Chambarak","Чамбарак"],
  "Մարտունի":["Martuni","Мартуни"],
  "Սևան":["Sevan","Севан"],
  "Վարդենիս":["Vardenis","Варденис"],
  "Լոռի":["Lori","Лори"],
  "Ալավերդի":["Alaverdi","Алаверди"],
  "Գյուլագարակ":["Gyulagarak","Гюлагарак"],
  "Թումանյան":["Tumanyan","Туманян"],
  "Լերմոնտովո":["Lermontovo","Лермонтово"],
  "Լոռի Բերդ":["Lori Berd","Лори Берд"],
  "Սպիտակ":["Spitak","Спитак"],
  "Ստեփանավան":["Stepanavan","Степанаван"],
  "Վանաձոր":["Vanadzor","Ванадзор"],
  "Տաշիր":["Tashir","Ташир"],
  "Փամբակ":["Pambak","Памбак"],
  "Ֆիոլետովո":["Fioletovo","Фиолетово"],
  "Կոտայք":["Kotayk","Котайк"],
  "Աբովյան":["Abovyan","Абовян"],
  "Ակունք":["Akunk","Акунк"],
  "Արզնի":["Arzni","Арзни"],
  "Բյուրեղավան":["Byureghavan","Бюрегаван"],
  "Գառնի":["Garni","Гарни"],
  "Ծաղկաձոր":["Tsaghkadzor","Цахкадзор"],
  "Հրազդան":["Hrazdan","Раздан"],
  "Նաիրի":["Nairi","Наири"],
  "Նոր Հաճըն":["Nor Hachn","Нор Ачн"],
  "Չարենցավան":["Charentsavan","Чаренцаван"],
  "Ջրվեժ":["Jrvezh","Джрвеж"],
  "Շիրակ":["Shirak","Ширак"],
  "Ախուրյան":["Akhuryan","Ахурян"],
  "Ամասիա":["Amasia","Амасия"],
  "Անի":["Ani","Ани"],
  "Աշոցք":["Ashotsk","Ашоцк"],
  "Արթիկ":["Artik","Артик"],
  "Գյումրի":["Gyumri","Гюмри"],
  "Սյունիք":["Syunik","Сюник"],
  "Գորիս":["Goris","Горис"],
  "Կապան":["Kapan","Капан"],
  "Մեղրի":["Meghri","Мегри"],
  "Սիսիան":["Sisian","Сисиан"],
  "Տաթև":["Tatev","Татев"],
  "Տեղ":["Tegh","Тег"],
  "Քաջարան":["Kajaran","Каджаран"],
  "Վայոց ձոր":["Vayots Dzor","Вайоц Дзор"],
  "Արենի":["Areni","Арени"],
  "Եղեգիս":["Yeghegis","Егегис"],
  "Եղեգնաձոր":["Yeghegnadzor","Егегнадзор"],
  "Ջերմուկ":["Jermuk","Джермук"],
  "Վայք":["Vayk","Вайк"],
  "Տավուշ":["Tavush","Тавуш"],
  "Բերդ":["Berd","Берд"],
  "Դիլիջան":["Dilijan","Дилижан"],
  "Իջևան":["Ijevan","Иджеван"],
  "Նոյեմբերյան":["Noyemberyan","Ноемберян"],
  "Երևան":["Yerevan","Ереван"],
};

var MARZ = {
  "Արագածոտն": ["Ալագյազ","Աշտարակ","Ապարան","Արևուտ","Թալին","Ծաղկահովիտ","Մեծաձոր","Շամիրամ"],
  "Արարատ":    ["Արարատ","Արտաշատ","Մասիս","Վեդի","Վերին Դվին"],
  "Արմավիր":   ["Արաքս","Արմավիր","Բաղրամյան","Մեծամոր","Վաղարշապատ","Փարաքար","Ֆերիկ"],
  "Գեղարքունիք":["Գավառ","Ճամբարակ","Մարտունի","Սևան","Վարդենիս"],
  "Լոռի":      ["Ալավերդի","Գյուլագարակ","Թումանյան","Լերմոնտովո","Լոռի Բերդ","Սպիտակ","Ստեփանավան","Վանաձոր","Տաշիր","Փամբակ","Ֆիոլետովո"],
  "Կոտայք":    ["Աբովյան","Ակունք","Արզնի","Բյուրեղավան","Գառնի","Ծաղկաձոր","Հրազդան","Նաիրի","Նոր Հաճըն","Չարենցավան","Ջրվեժ"],
  "Շիրակ":     ["Ախուրյան","Ամասիա","Անի","Աշոցք","Արթիկ","Գյումրի"],
  "Սյունիք":   ["Գորիս","Կապան","Մեղրի","Սիսիան","Տաթև","Տեղ","Քաջարան"],
  "Վայոց ձոր": ["Արենի","Եղեգիս","Եղեգնաձոր","Ջերմուկ","Վայք"],
  "Տավուշ":    ["Բերդ","Դիլիջան","Իջևան","Նոյեմբերյան"],
  "Երևան":     ["Երևան"],
};

/** Translate a place name; `lang` is "hy" | "en" | "ru". */
function placeIn(hy, lang) {
  return lang === "hy" ? hy : ((PLACE[hy] || [])[lang === "en" ? 0 : 1] || hy);
}

/**
 * Marz -> the first two digits of a cadastral code. Verified against live
 * auction data for 02, 03, 06, 07, 08, 09 and 10 (and 01 from Yerevan test
 * codes); 04, 05 and 11 follow the same alphabetical order, Yerevan first.
 */
var MARZ_CODE = {
  "Երևան": "01", "Արագածոտն": "02", "Արարատ": "03", "Արմավիր": "04",
  "Գեղարքունիք": "05", "Լոռի": "06", "Կոտայք": "07", "Շիրակ": "08",
  "Սյունիք": "09", "Վայոց ձոր": "10", "Տավուշ": "11",
};

/**
 * Does a lot belong to the selected region?
 *   ""            -> everything
 *   "marz:<name>" -> the code's marz digits; text only when there is no code
 *   "<community>" -> the organising community, then the title as a fallback
 *
 * Titles arrive in mixed case and in ALL CAPS, so text comparison is done on
 * uppercased strings — Armenian uppercases cleanly in JS.
 */
function matchRegion(lot, value) {
  if (!value) return true;
  const up = (s) => String(s || "").toUpperCase();
  const hay = up(`${lot.organizer || ""} ${lot.title || ""}`);
  const code = String(lot.code || lot.cadastre_code || "");
  // `marz` is stored as a small integer (the code's first two digits); fall
  // back to the code itself for rows served without it.
  const marzNo = lot.marz != null ? String(lot.marz).padStart(2, "0")
               : code ? code.slice(0, 2) : "";

  if (value.startsWith("marz:")) {
    const marz = value.slice(5);
    const digits = MARZ_CODE[marz];
    if (marzNo && digits) return marzNo === digits;            // exact
    // no code: fall back to the marz name or any of its communities
    return [marz, ...(MARZ[marz] || [])].some(w => hay.includes(up(w)));
  }

  // A community: its own auctions are organised by it.
  if (up(lot.organizer).startsWith(up(value))) return true;
  // Otherwise the lot must name the place AND sit in the right marz, which
  // stops "Արարատ" the town from matching all of "Արարատի մարզ".
  if (!hay.includes(up(value))) return false;
  const marz = Object.keys(MARZ).find(m => (MARZ[m] || []).includes(value));
  const digits = marz ? MARZ_CODE[marz] : null;
  return !code || !digits || code.slice(0, 2) === digits;
}
