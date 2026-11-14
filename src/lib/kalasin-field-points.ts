export interface FieldMissionPoint {
  no: number;
  name: string;
  team: string;
  coordinator: string;
  phone: string;
  latitude: number;
  longitude: number;
  mapsUrl: string;
}

/**
 * 23 verified Kalasin field mission points (Team G) imported from Google Sheet:
 * "พิกัดจุดพันธกิจทีม G - Registration Data" (gid=2126759810).
 */
export const KALASIN_TEAM_G_POINTS: FieldMissionPoint[] = [
  {
    no: 1,
    name: 'บ้านวราภรณ์',
    team: 'G',
    coordinator: 'เบญจมัย เลี่ยมเพชรรัตน์',
    phone: '083-026-3503',
    latitude: 16.4266124,
    longitude: 103.5216847,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B025'34.7%22N+103%C2%B031'21.9%22E/@16.4266124,103.5216847,548m/data=!3m1!1e3!4m4!3m3!8m2!3d16.4263056!4d103.52275",
  },
  {
    no: 2,
    name: 'วังเกาะเหล็ก',
    team: 'G',
    coordinator: 'เบญจมัย เลี่ยมเพชรรัตน์',
    phone: '083-026-3503',
    latitude: 16.467563,
    longitude: 103.4986331,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B028'03.2%22N+103%C2%B030'04.4%22E/@16.467563,103.4986331,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.467563!4d103.501208",
  },
  {
    no: 3,
    name: 'โนนเที่ยง',
    team: 'G',
    coordinator: 'ผุสดี แซ่ก่วย',
    phone: '088-275-5075',
    latitude: 16.563713,
    longitude: 103.7597931,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B033'49.4%22N+103%C2%B045'44.5%22E/@16.563713,103.7597931,1097m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.563713!4d103.762368",
  },
  {
    no: 4,
    name: 'ดอนยูง',
    team: 'G',
    coordinator: 'สรรเสริญ ดวงจิตร',
    phone: '080-858-7037',
    latitude: 16.314069,
    longitude: 103.555431,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B018'50.7%22N+103%C2%B033'19.6%22E/@16.314069,103.555431,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.314069!4d103.555431",
  },
  {
    no: 5,
    name: 'โพนงาม',
    team: 'G',
    coordinator: 'สรรเสริญ ดวงจิตร',
    phone: '080-858-7037',
    latitude: 16.318595,
    longitude: 103.676063,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B019'06.9%22N+103%C2%B040'33.8%22E/@16.318595,103.676063,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.318595!4d103.676063",
  },
  {
    no: 6,
    name: 'กมลาไสย',
    team: 'G',
    coordinator: 'สุดใจ จำปาเหลือง',
    phone: '090-224-0628',
    latitude: 16.335814,
    longitude: 103.582272,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B020'08.9%22N+103%C2%B034'56.2%22E/@16.335814,103.582272,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.335814!4d103.582272",
  },
  {
    no: 7,
    name: 'ยางตลาด',
    team: 'G',
    coordinator: 'สมเพียร ศิริเย็น',
    phone: '091-868-7535',
    latitude: 16.3913333,
    longitude: 103.3550556,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B023'28.8%22N+103%C2%B021'18.2%22E/@16.3913333,103.3550556,1095m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.3913333!4d103.3550556",
  },
  {
    no: 8,
    name: 'หนองแวงแสน',
    team: 'G',
    coordinator: 'ดาวใจ โพธิสม',
    phone: '091-868-7535',
    latitude: 16.45712,
    longitude: 103.6726381,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B027'25.6%22N+103%C2%B040'30.8%22E/@16.45712,103.6726381,1097m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.45712!4d103.675213",
  },
  {
    no: 9,
    name: 'โคกเครือ',
    team: 'G',
    coordinator: 'ดาวใจ โพธิสม',
    phone: '091-868-7535',
    latitude: 16.394841,
    longitude: 103.4384221,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B023'41.4%22N+103%C2%B026'27.6%22E/@16.394841,103.4384221,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.394841!4d103.440997",
  },
  {
    no: 10,
    name: 'ดอนย่านาง',
    team: 'G',
    coordinator: 'ดาวใจ โพธิสม',
    phone: '091-868-7535',
    latitude: 16.412665,
    longitude: 103.4549231,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B024'45.6%22N+103%C2%B027'27.0%22E/@16.412665,103.4549231,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.412665!4d103.457498",
  },
  {
    no: 11,
    name: 'บ้านเสียว',
    team: 'G',
    coordinator: 'ดาวใจ โพธิสม',
    phone: '091-868-7535',
    latitude: 16.336667,
    longitude: 103.4255921,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B020'12.0%22N+103%C2%B025'41.4%22E/@16.336667,103.4255921,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.336667!4d103.428167",
  },
  {
    no: 12,
    name: 'เชียงเครือ',
    team: 'G',
    coordinator: 'ดาวใจ โพธิสม',
    phone: '091-868-7535',
    latitude: 16.443075,
    longitude: 103.6173961,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B026'35.1%22N+103%C2%B037'11.9%22E/@16.443075,103.6173961,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.443075!4d103.619971",
  },
  {
    no: 13,
    name: 'บ้านหลุบ',
    team: 'G',
    coordinator: 'สถิต เหล็กเพ็ชร',
    phone: '085-803-4784',
    latitude: 16.411739,
    longitude: 103.518424,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B024'42.3%22N+103%C2%B031'06.3%22E/@16.411739,103.518424,1097m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.411739!4d103.518424",
  },
  {
    no: 14,
    name: 'เขาวง',
    team: 'G',
    coordinator: 'บุญเริ่ม บาลเพ็ชร',
    phone: '061-074-7693',
    latitude: 16.6408139,
    longitude: 104.1309969,
    mapsUrl: 'https://www.google.com/maps?q=16.6408139,104.1309969',
  },
  {
    no: 15,
    name: 'บ้านภูฮัง',
    team: 'G',
    coordinator: 'เสาวนีย์ จิตรักษ์',
    phone: '065-054-1082',
    latitude: 16.811819,
    longitude: 103.2844831,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B048'42.6%22N+103%C2%B017'13.4%22E/@16.811819,103.2844831,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.811819!4d103.287058",
  },
  {
    no: 16,
    name: 'บ้านภูฮัง2',
    team: 'G',
    coordinator: 'เสาวนีย์ จิตรักษ์',
    phone: '065-054-1082',
    latitude: 16.811819,
    longitude: 103.2844831,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B048'42.6%22N+103%C2%B017'13.4%22E/@16.811819,103.2844831,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.811819!4d103.287058",
  },
  {
    no: 17,
    name: 'ท่าคันโท 1',
    team: 'G',
    coordinator: 'เสาวนีย์ จิตรักษ์',
    phone: '065-054-1082',
    latitude: 16.933993,
    longitude: 103.2474601,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B056'02.4%22N+103%C2%B015'00.1%22E/@16.933993,103.2474601,1094m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.933993!4d103.250035",
  },
  {
    no: 18,
    name: 'นาตาล',
    team: 'G',
    coordinator: 'เสาวนีย์ จิตรักษ์',
    phone: '065-054-1082',
    latitude: 16.9340293,
    longitude: 103.2491913,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B056'02.5%22N+103%C2%B014'59.4%22E/@16.9340293,103.2491913,274m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.934028!4d103.249835",
  },
  {
    no: 19,
    name: 'คำใหญ่',
    team: 'G',
    coordinator: 'รัตนาภรณ์ แก้วเกตุ',
    phone: '064-596-5869',
    latitude: 16.7001131,
    longitude: 103.4089073,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B042'00.4%22N+103%C2%B024'41.3%22E/@16.7001131,103.4089073,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.7001131!4d103.4114822",
  },
  {
    no: 20,
    name: 'คำศรี',
    team: 'G',
    coordinator: 'รัตนาภรณ์ แก้วเกตุ',
    phone: '064-596-5869',
    latitude: 16.7001131,
    longitude: 103.4089073,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B042'00.4%22N+103%C2%B024'41.3%22E/@16.7001131,103.4089073,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.7001131!4d103.4114822",
  },
  {
    no: 21,
    name: 'บ้านหัวนาคำ',
    team: 'G',
    coordinator: 'แม่โยด',
    phone: '082-252-4101',
    latitude: 16.495792,
    longitude: 104.0190491,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B029'44.9%22N+104%C2%B001'17.9%22E/@16.495792,104.0190491,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.495792!4d104.021624",
  },
  {
    no: 22,
    name: 'บ้านดอนอุมรัว',
    team: 'G',
    coordinator: 'ยายเพ็ง',
    phone: '093-767-2991',
    latitude: 16.5179444,
    longitude: 104.0816944,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B031'04.6%22N+104%C2%B004'54.1%22E/@16.5179444,104.0816944,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.5179444!4d104.0816944",
  },
  {
    no: 23,
    name: 'บ้านบัวขาว',
    team: 'G',
    coordinator: 'เพลินพิศ',
    phone: '097-120-7102',
    latitude: 16.522904,
    longitude: 104.0441211,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B031'22.5%22N+104%C2%B002'48.1%22E/@16.522904,104.0441211,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.522904!4d104.046696",
  },
];
