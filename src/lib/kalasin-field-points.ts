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
 * 23 Kalasin field mission points (Team G) with synthetic coordinator placeholders (G-19 resolved).
 * Point names and coordinates preserved from registration data; real personal data removed.
 */
export const KALASIN_TEAM_G_POINTS: FieldMissionPoint[] = [
  {
    no: 1,
    name: 'บ้านวราภรณ์',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 1',
    phone: '080-000-0001',
    latitude: 16.4266124,
    longitude: 103.5216847,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B025'34.7%22N+103%C2%B031'21.9%22E/@16.4266124,103.5216847,548m/data=!3m1!1e3!4m4!3m3!8m2!3d16.4263056!4d103.52275",
  },
  {
    no: 2,
    name: 'วังเกาะเหล็ก',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 2',
    phone: '080-000-0002',
    latitude: 16.467563,
    longitude: 103.4986331,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B028'03.2%22N+103%C2%B030'04.4%22E/@16.467563,103.4986331,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.467563!4d103.501208",
  },
  {
    no: 3,
    name: 'โนนเที่ยง',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 3',
    phone: '080-000-0003',
    latitude: 16.563713,
    longitude: 103.7597931,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B033'49.4%22N+103%C2%B045'44.5%22E/@16.563713,103.7597931,1097m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.563713!4d103.762368",
  },
  {
    no: 4,
    name: 'ดอนยูง',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 4',
    phone: '080-000-0004',
    latitude: 16.314069,
    longitude: 103.555431,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B018'50.7%22N+103%C2%B033'19.6%22E/@16.314069,103.555431,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.314069!4d103.555431",
  },
  {
    no: 5,
    name: 'โพนงาม',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 5',
    phone: '080-000-0005',
    latitude: 16.318595,
    longitude: 103.676063,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B019'06.9%22N+103%C2%B040'33.8%22E/@16.318595,103.676063,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.318595!4d103.676063",
  },
  {
    no: 6,
    name: 'กมลาไสย',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 6',
    phone: '080-000-0006',
    latitude: 16.335814,
    longitude: 103.582272,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B020'08.9%22N+103%C2%B034'56.2%22E/@16.335814,103.582272,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.335814!4d103.582272",
  },
  {
    no: 7,
    name: 'ยางตลาด',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 7',
    phone: '080-000-0007',
    latitude: 16.3913333,
    longitude: 103.3550556,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B023'28.8%22N+103%C2%B021'18.2%22E/@16.3913333,103.3550556,1095m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.3913333!4d103.3550556",
  },
  {
    no: 8,
    name: 'หนองแวงแสน',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 8',
    phone: '080-000-0008',
    latitude: 16.45712,
    longitude: 103.6726381,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B027'25.6%22N+103%C2%B040'30.8%22E/@16.45712,103.6726381,1097m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.45712!4d103.675213",
  },
  {
    no: 9,
    name: 'โคกเครือ',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 9',
    phone: '080-000-0009',
    latitude: 16.394841,
    longitude: 103.4384221,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B023'41.4%22N+103%C2%B026'27.6%22E/@16.394841,103.4384221,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.394841!4d103.440997",
  },
  {
    no: 10,
    name: 'ดอนย่านาง',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 10',
    phone: '080-000-0010',
    latitude: 16.412665,
    longitude: 103.4549231,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B024'45.6%22N+103%C2%B027'27.0%22E/@16.412665,103.4549231,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.412665!4d103.457498",
  },
  {
    no: 11,
    name: 'บ้านเสียว',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 11',
    phone: '080-000-0011',
    latitude: 16.336667,
    longitude: 103.4255921,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B020'12.0%22N+103%C2%B025'41.4%22E/@16.336667,103.4255921,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.336667!4d103.428167",
  },
  {
    no: 12,
    name: 'เชียงเครือ',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 12',
    phone: '080-000-0012',
    latitude: 16.443075,
    longitude: 103.6173961,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B026'35.1%22N+103%C2%B037'11.9%22E/@16.443075,103.6173961,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.443075!4d103.619971",
  },
  {
    no: 13,
    name: 'บ้านหลุบ',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 13',
    phone: '080-000-0013',
    latitude: 16.411739,
    longitude: 103.518424,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B024'42.3%22N+103%C2%B031'06.3%22E/@16.411739,103.518424,1097m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.411739!4d103.518424",
  },
  {
    no: 14,
    name: 'เขาวง',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 14',
    phone: '080-000-0014',
    latitude: 16.6408139,
    longitude: 104.1309969,
    mapsUrl: 'https://www.google.com/maps?q=16.6408139,104.1309969',
  },
  {
    no: 15,
    name: 'บ้านภูฮัง',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 15',
    phone: '080-000-0015',
    latitude: 16.811819,
    longitude: 103.2844831,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B048'42.6%22N+103%C2%B017'13.4%22E/@16.811819,103.2844831,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.811819!4d103.287058",
  },
  {
    no: 16,
    name: 'บ้านภูฮัง2',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 16',
    phone: '080-000-0016',
    latitude: 16.811819,
    longitude: 103.2844831,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B048'42.6%22N+103%C2%B017'13.4%22E/@16.811819,103.2844831,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.811819!4d103.287058",
  },
  {
    no: 17,
    name: 'ท่าคันโท 1',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 17',
    phone: '080-000-0017',
    latitude: 16.933993,
    longitude: 103.2474601,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B056'02.4%22N+103%C2%B015'00.1%22E/@16.933993,103.2474601,1094m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.933993!4d103.250035",
  },
  {
    no: 18,
    name: 'นาตาล',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 18',
    phone: '080-000-0018',
    latitude: 16.9340293,
    longitude: 103.2491913,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B056'02.5%22N+103%C2%B014'59.4%22E/@16.9340293,103.2491913,274m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.934028!4d103.249835",
  },
  {
    no: 19,
    name: 'คำใหญ่',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 19',
    phone: '080-000-0019',
    latitude: 16.7001131,
    longitude: 103.4089073,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B042'00.4%22N+103%C2%B024'41.3%22E/@16.7001131,103.4089073,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.7001131!4d103.4114822",
  },
  {
    no: 20,
    name: 'คำศรี',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 20',
    phone: '080-000-0020',
    latitude: 16.7001131,
    longitude: 103.4089073,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B042'00.4%22N+103%C2%B024'41.3%22E/@16.7001131,103.4089073,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.7001131!4d103.4114822",
  },
  {
    no: 21,
    name: 'บ้านหัวนาคำ',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 21',
    phone: '080-000-0021',
    latitude: 16.495792,
    longitude: 104.0190491,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B029'44.9%22N+104%C2%B001'17.9%22E/@16.495792,104.0190491,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.495792!4d104.021624",
  },
  {
    no: 22,
    name: 'บ้านดอนอุมรัว',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 22',
    phone: '080-000-0022',
    latitude: 16.5179444,
    longitude: 104.0816944,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B031'04.6%22N+104%C2%B004'54.1%22E/@16.5179444,104.0816944,1096m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d16.5179444!4d104.0816944",
  },
  {
    no: 23,
    name: 'บ้านบัวขาว',
    team: 'G',
    coordinator: 'ผู้ประสานงาน จุดที่ 23',
    phone: '080-000-0023',
    latitude: 16.522904,
    longitude: 104.0441211,
    mapsUrl:
      "https://www.google.com/maps/place/16%C2%B031'22.5%22N+104%C2%B002'48.1%22E/@16.522904,104.0441211,17z/data=!3m1!4b1!4m4!3m3!8m2!3d16.522904!4d104.046696",
  },
];
