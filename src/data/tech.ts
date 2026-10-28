import type { Tech } from './schema';

// Technology tree (1960 ~ 2040). Countries start with every tech whose year <= their techYear.
export const TECHS: Tech[] = [
  // ── 기갑 (armor) ──
  { id: 'tank_g1', name: '1세대 전차', cat: 'armor', year: 1960, cost: 50, req: [], desc: '대구경 강선포와 주조 장갑을 갖춘 전후 1세대 전차.' },
  { id: 'tank_g2', name: '2세대 전차', cat: 'armor', year: 1970, cost: 90, req: ['tank_g1'], desc: '안정화 포수 조준경과 NBC 방호를 갖춘 2세대 전차.' },
  { id: 'tank_g3', name: '3세대 전차', cat: 'armor', year: 1977, cost: 160, req: ['tank_g2'], desc: '복합장갑, 활강포, 디지털 사격통제를 갖춘 3세대 전차.' },
  { id: 'tank_g3p', name: '3.5세대 전차', cat: 'armor', year: 2000, cost: 300, req: ['tank_g3'], desc: '전장관리체계와 열상 헌터킬러 능력을 갖춘 개량형 전차.' },
  { id: 'tank_aps', name: '능동방호체계(APS)', cat: 'armor', year: 2015, cost: 500, req: ['tank_g3p'], desc: '트로피·아프가니트 등 날아오는 대전차탄을 요격하는 하드킬 방호.', effects: { landDefense: 0.03 } },
  { id: 'tank_g4', name: '4세대 전차', cat: 'armor', year: 2030, cost: 1000, req: ['tank_aps', 'ai_2'], desc: '무인 포탑, 하이브리드 동력, 유무인 협업을 갖춘 차세대 전차.' },
  { id: 'afv_g1', name: '1세대 장갑전투차량', cat: 'armor', year: 1960, cost: 45, req: [], desc: '궤도형 병력수송차와 초기 보병전투차.' },
  { id: 'afv_g2', name: '2세대 장갑전투차량', cat: 'armor', year: 1982, cost: 160, req: ['afv_g1'], desc: '대전차미사일과 기관포 포탑을 갖춘 보병전투차.' },
  { id: 'afv_g3', name: '현대 장갑전투차량', cat: 'armor', year: 2005, cost: 320, req: ['afv_g2'], desc: '모듈식 장갑과 원격무장을 갖춘 궤도·차륜형 전투차.' },
  { id: 'afv_g4', name: '차세대 보병전투차', cat: 'armor', year: 2020, cost: 560, req: ['afv_g3', 'tank_aps'], desc: 'APS와 고무궤도, 무인 포탑을 갖춘 차세대 보병전투차.' },

  // ── 지상 (land) ──
  { id: 'inf_g1', name: '자동소총 보병화기', cat: 'land', year: 1960, cost: 40, req: [], desc: '자동소총과 기본 대전차 로켓 보병 장비.' },
  { id: 'inf_g2', name: '소구경 고속탄 소총', cat: 'land', year: 1974, cost: 80, req: ['inf_g1'], desc: '5.45/5.56mm 소구경탄과 2세대 휴대 대전차화기.' },
  { id: 'inf_g3', name: '현대화 보병 체계', cat: 'land', year: 1995, cost: 220, req: ['inf_g2'], desc: '광학조준경, 방탄복, 야간투시경을 갖춘 보병.', effects: { landDefense: 0.03 } },
  { id: 'inf_g4', name: '미래 전투병 체계', cat: 'land', year: 2018, cost: 520, req: ['inf_g3', 'c4i'], desc: '디지털 조준·통신 장비와 차세대 소총을 갖춘 워리어 플랫폼.', effects: { landAttack: 0.03 } },
  { id: 'logistics_1', name: '현대 군수체계', cat: 'land', year: 1970, cost: 80, req: [], desc: '팔레트·컨테이너화와 차량화 보급 체계.', effects: { supply: 0.05 } },
  { id: 'logistics_2', name: '전산화 군수', cat: 'land', year: 1995, cost: 240, req: ['logistics_1', 'computing_2'], desc: '전산화된 재고·수송 관리와 자산 추적.', effects: { supply: 0.06, orgRecovery: 0.03 } },
  { id: 'logistics_3', name: 'AI 예측 군수', cat: 'land', year: 2022, cost: 600, req: ['logistics_2', 'ai_1'], desc: '수요 예측과 자율 수송을 결합한 데이터 기반 군수.', effects: { supply: 0.08 } },
  { id: 'loitering', name: '드론·배회형 탄약', cat: 'land', year: 2020, cost: 560, req: ['uav_1'], desc: 'FPV 드론과 배회형 자폭탄을 이용한 정밀 타격.', effects: { landAttack: 0.06 } },

  // ── 포병 (artillery) ──
  { id: 'art_g1', name: '견인포·로켓 체계', cat: 'artillery', year: 1960, cost: 40, req: [], desc: '견인 곡사포와 초기 다연장로켓.' },
  { id: 'spg_g1', name: '1세대 자주포', cat: 'artillery', year: 1972, cost: 90, req: ['art_g1'], desc: '궤도 차체에 포를 얹은 1세대 자주포.' },
  { id: 'spg_g2', name: '디지털 사격통제 포병', cat: 'artillery', year: 1995, cost: 250, req: ['spg_g1', 'computing_2'], desc: '자동 사격통제와 신속 방열을 갖춘 52구경장 포병.' },
  { id: 'spg_g3', name: '자동장전 자주포', cat: 'artillery', year: 2015, cost: 500, req: ['spg_g2'], desc: '자동 장전·탄약 처리로 분당 사격량을 끌어올린 자주포.', effects: { landAttack: 0.03 } },
  { id: 'mlrs_g1', name: '대구경 다연장로켓', cat: 'artillery', year: 1985, cost: 170, req: ['art_g1'], desc: '220~300mm급 대구경 로켓 체계.' },
  { id: 'mlrs_g2', name: '유도 다연장로켓', cat: 'artillery', year: 2005, cost: 330, req: ['mlrs_g1'], desc: 'GPS/INS 유도 로켓으로 정밀 타격하는 다연장 체계.', effects: { landAttack: 0.03 } },

  // ── 항공 (air) ──
  { id: 'jet_g2', name: '2세대 제트전투기', cat: 'air', year: 1960, cost: 50, req: [], desc: '초음속 요격기와 초기 공대공미사일.' },
  { id: 'jet_g3', name: '3세대 전투기', cat: 'air', year: 1968, cost: 90, req: ['jet_g2'], desc: '레이더 유도 미사일과 다목적 운용 능력을 갖춘 전투기.' },
  { id: 'jet_g4', name: '4세대 전투기', cat: 'air', year: 1978, cost: 180, req: ['jet_g3'], desc: '플라이바이와이어와 고기동성을 갖춘 전투기.' },
  { id: 'jet_g45', name: '4.5세대 전투기', cat: 'air', year: 2000, cost: 320, req: ['jet_g4'], desc: '정밀유도무장과 센서 융합을 갖춘 개량형 다목적 전투기.' },
  { id: 'jet_g5', name: '5세대 스텔스 전투기', cat: 'air', year: 2005, cost: 600, req: ['jet_g45', 'stealth_1', 'aesa'], desc: '스텔스, 초음속 순항, 센서 융합을 통합한 전투기.', effects: { airPower: 0.05 } },
  { id: 'jet_g6', name: '6세대 전투기', cat: 'air', year: 2035, cost: 1200, req: ['jet_g5', 'ai_2'], desc: 'F-47·GCAP·FCAS처럼 무인기를 지휘하는 차세대 제공 전투기.', effects: { airPower: 0.08 } },
  { id: 'stealth_1', name: '스텔스 형상 설계', cat: 'air', year: 1985, cost: 200, req: ['jet_g4'], desc: '레이더 반사면적을 줄이는 형상 설계와 전파 흡수재.', effects: { airPower: 0.03 } },
  { id: 'bomber_g1', name: '전략폭격기', cat: 'air', year: 1960, cost: 50, req: [], desc: '장거리 아음속 전략폭격기.' },
  { id: 'bomber_g2', name: '현대화 장거리 폭격기', cat: 'air', year: 1987, cost: 180, req: ['bomber_g1', 'jet_g4'], desc: '가변익·초음속 폭격기와 장거리 순항미사일 운반기.' },
  { id: 'heli_g1', name: '공격헬기', cat: 'air', year: 1967, cost: 60, req: [], desc: '대전차미사일을 장착한 1세대 공격헬기.' },
  { id: 'heli_g2', name: '현대 공격헬기', cat: 'air', year: 1986, cost: 200, req: ['heli_g1'], desc: '야간 전천후 능력과 밀리미터파 레이더를 갖춘 공격헬기.' },
  { id: 'uav_1', name: '무인항공기(UAV)', cat: 'air', year: 2000, cost: 300, req: ['computing_2'], desc: '위성통신으로 원격 조종하는 중고도 장기체공 무인기.', effects: { airPower: 0.03 } },
  { id: 'ucav', name: '무인전투기(CCA·로열윙맨)', cat: 'air', year: 2028, cost: 900, req: ['uav_1', 'ai_2'], desc: '유인기와 편대를 이루는 자율 협동 전투기.', effects: { airPower: 0.06 } },

  // ── 해군 (naval) ──
  { id: 'dd_g1', name: '미사일 구축함', cat: 'naval', year: 1962, cost: 60, req: [], desc: '함대공·대함 미사일을 탑재한 구축함.' },
  { id: 'dd_g2', name: '이지스 구축함', cat: 'naval', year: 1991, cost: 250, req: ['dd_g1', 'computing_2'], desc: '위상배열 레이더와 수직발사기를 통합한 함대 방공 체계.', effects: { navalPower: 0.03 } },
  { id: 'dd_g3', name: '대형 통합전력 구축함', cat: 'naval', year: 2015, cost: 600, req: ['dd_g2', 'aesa'], desc: '탄도탄 방어와 통합전력체계를 갖춘 대형 수상전투함.', effects: { navalPower: 0.04 } },
  { id: 'frigate_g1', name: '미사일 호위함', cat: 'naval', year: 1970, cost: 80, req: ['dd_g1'], desc: '대잠·대공 미사일을 갖춘 다목적 호위함.' },
  { id: 'frigate_g2', name: '스텔스 호위함', cat: 'naval', year: 2005, cost: 300, req: ['frigate_g1'], desc: '스텔스 선체와 예인음탐기를 갖춘 다목적 호위함.' },
  { id: 'sub_g1', name: '디젤 잠수함', cat: 'naval', year: 1960, cost: 50, req: [], desc: '스노클 방식의 전후 디젤-전기 잠수함.' },
  { id: 'sub_g2', name: '현대 디젤 잠수함', cat: 'naval', year: 1975, cost: 100, req: ['sub_g1'], desc: '저소음 선체와 유선유도어뢰를 갖춘 재래식 잠수함.' },
  { id: 'sub_aip', name: 'AIP 잠수함', cat: 'naval', year: 2005, cost: 320, req: ['sub_g2'], desc: '공기불요추진으로 수중 체류 기간을 늘린 잠수함.', effects: { navalPower: 0.03 } },
  { id: 'nuc_sub_1', name: '핵추진 잠수함', cat: 'naval', year: 1962, cost: 80, req: ['sub_g1'], desc: '원자로 추진 공격·전략 잠수함.' },
  { id: 'nuc_sub_2', name: '저소음 핵잠수함', cat: 'naval', year: 1995, cost: 280, req: ['nuc_sub_1'], desc: '펌프제트와 무반향 코팅을 갖춘 저소음 핵잠수함.', effects: { navalPower: 0.03 } },
  { id: 'nuc_sub_3', name: '차세대 핵잠수함', cat: 'naval', year: 2030, cost: 1050, req: ['nuc_sub_2', 'ai_1'], desc: '전기추진과 평생 노심을 갖춘 차세대 핵잠수함.', effects: { navalPower: 0.04 } },
  { id: 'carrier_g1', name: '항공모함 운용', cat: 'naval', year: 1960, cost: 60, req: [], desc: '스키점프·강습상륙함을 포함한 함재기 운용.' },
  { id: 'carrier_g2', name: '대형 CATOBAR 항모', cat: 'naval', year: 1975, cost: 200, req: ['carrier_g1', 'nuc_sub_1'], desc: '증기 캐터펄트와 핵추진을 갖춘 대형 항공모함.' },
  { id: 'carrier_emals', name: 'EMALS 전자식 캐터펄트', cat: 'naval', year: 2017, cost: 550, req: ['carrier_g2'], desc: '전자기식 사출·착함 장치로 소티 생성률을 높인 항모.', effects: { navalPower: 0.03 } },

  // ── 전자 (electronics) ──
  { id: 'computing_1', name: '트랜지스터 전산', cat: 'electronics', year: 1960, cost: 50, req: [], desc: '트랜지스터 기반 군용 컴퓨터.', effects: { researchSpeed: 0.03 } },
  { id: 'computing_2', name: '마이크로프로세서', cat: 'electronics', year: 1980, cost: 140, req: ['computing_1'], desc: '마이크로프로세서와 디지털 신호처리.', effects: { researchSpeed: 0.04 } },
  { id: 'computing_3', name: '인터넷·분산 전산', cat: 'electronics', year: 1998, cost: 280, req: ['computing_2'], desc: '네트워크와 분산 컴퓨팅을 활용한 연구개발.', effects: { researchSpeed: 0.05, gdpGrowth: 0.2 } },
  { id: 'ai_1', name: '머신러닝', cat: 'electronics', year: 2015, cost: 500, req: ['computing_3'], desc: '딥러닝 기반 영상 인식과 데이터 분석.', effects: { researchSpeed: 0.05, gdpGrowth: 0.1 } },
  { id: 'ai_2', name: '군사용 AI·자율체계', cat: 'electronics', year: 2028, cost: 900, req: ['ai_1', 'semis'], desc: '표적 식별과 지휘결심을 돕는 군사 AI.', effects: { researchSpeed: 0.06, landAttack: 0.03 } },
  { id: 'quantum', name: '양자컴퓨팅', cat: 'electronics', year: 2038, cost: 1300, req: ['ai_2'], desc: '오류정정 양자컴퓨터와 양자 센서.', effects: { researchSpeed: 0.08, gdpGrowth: 0.2 } },
  { id: 'aesa', name: 'AESA 레이더', cat: 'electronics', year: 2005, cost: 320, req: ['computing_2'], desc: '능동전자주사식 위상배열 레이더.', effects: { airPower: 0.05 } },
  { id: 'gan_aesa', name: 'GaN AESA', cat: 'electronics', year: 2020, cost: 550, req: ['aesa', 'semis'], desc: '질화갈륨 소자로 출력과 탐지거리를 높인 AESA.', effects: { airPower: 0.04, navalPower: 0.03 } },
  { id: 'c4i', name: 'C4I·전술 데이터링크', cat: 'electronics', year: 1995, cost: 220, req: ['computing_2'], desc: 'Link-16 등 전술 데이터링크와 지휘통제 체계.', effects: { landAttack: 0.04, landDefense: 0.04 } },
  { id: 'ncw', name: '네트워크중심전', cat: 'electronics', year: 2012, cost: 450, req: ['c4i', 'computing_3'], desc: '센서-슈터를 실시간 연결하는 네트워크중심전.', effects: { landAttack: 0.05, landDefense: 0.05, orgRecovery: 0.05 } },
  { id: 'space_isr', name: '저궤도 위성 감시정찰', cat: 'electronics', year: 2022, cost: 600, req: ['computing_3', 'ai_1'], desc: '소형 SAR 위성군과 위성통신망을 이용한 상시 감시.', effects: { landAttack: 0.03, navalPower: 0.04 } },

  // ── 산업 (industry) ──
  { id: 'ind_1', name: '조립라인 표준화', cat: 'industry', year: 1960, cost: 50, req: [], desc: '표준화된 대량생산 조립라인.', effects: { industryCap: 0.05, prodEfficiency: 0.05 } },
  { id: 'ind_2', name: '수치제어(NC) 공작기계', cat: 'industry', year: 1975, cost: 100, req: ['ind_1'], desc: 'NC 공작기계로 정밀 부품 생산성을 높인다.', effects: { industryCap: 0.05, prodEfficiency: 0.05 } },
  { id: 'ind_3', name: 'CAD/CAM 유연생산', cat: 'industry', year: 1990, cost: 200, req: ['ind_2', 'computing_2'], desc: '컴퓨터 설계와 유연생산 시스템.', effects: { industryCap: 0.06, prodEfficiency: 0.05, gdpGrowth: 0.1 } },
  { id: 'ind_4', name: '스마트 팩토리', cat: 'industry', year: 2015, cost: 500, req: ['ind_3', 'computing_3'], desc: '산업용 IoT와 로봇, 적층제조를 결합한 공장.', effects: { industryCap: 0.08, prodEfficiency: 0.06, gdpGrowth: 0.2 } },
  { id: 'ind_5', name: 'AI 자동화 생산', cat: 'industry', year: 2030, cost: 1050, req: ['ind_4', 'ai_2'], desc: 'AI가 공정을 최적화하는 무인 자동화 생산.', effects: { industryCap: 0.1, prodEfficiency: 0.08, gdpGrowth: 0.3 } },
  { id: 'semis', name: '첨단 반도체 공정', cat: 'industry', year: 2010, cost: 400, req: ['computing_3', 'ind_3'], desc: '미세공정 반도체와 군용 고신뢰 칩 생산.', effects: { industryCap: 0.04, gdpGrowth: 0.2, researchSpeed: 0.03 } },

  // ── 미사일 (missile) ──
  { id: 'sam_g1', name: '1세대 지대공미사일', cat: 'missile', year: 1960, cost: 50, req: [], desc: '지령유도 방식의 고정·반이동식 지대공미사일.' },
  { id: 'sam_g2', name: '이동식 중거리 SAM', cat: 'missile', year: 1980, cost: 150, req: ['sam_g1', 'computing_2'], desc: '위상배열 레이더를 갖춘 이동식 중거리 방공.' },
  { id: 'sam_g3', name: '탄도탄 요격 방공', cat: 'missile', year: 2003, cost: 300, req: ['sam_g2'], desc: 'PAC-3, S-400처럼 탄도탄까지 요격하는 방공 체계.', effects: { landDefense: 0.03 } },
  { id: 'sam_g4', name: '상층 미사일방어', cat: 'missile', year: 2008, cost: 400, req: ['sam_g3', 'aesa'], desc: 'THAAD·L-SAM 등 고고도 탄도탄 요격 체계.', effects: { landDefense: 0.03 } },
  { id: 'asm_g1', name: '대함·순항미사일', cat: 'missile', year: 1970, cost: 80, req: [], desc: '해면밀착 대함미사일과 지상공격 순항미사일.', effects: { navalPower: 0.03 } },
  { id: 'srbm', name: '전술 탄도미사일', cat: 'missile', year: 1990, cost: 200, req: ['asm_g1', 'computing_2'], desc: '이스칸데르·현무·ATACMS 같은 정밀 단거리 탄도미사일.', effects: { landAttack: 0.04 } },
  { id: 'hypersonic', name: '극초음속 미사일', cat: 'missile', year: 2020, cost: 650, req: ['srbm'], desc: '극초음속 활공체와 스크램제트 순항미사일.', effects: { landAttack: 0.05, navalPower: 0.05 } },
  { id: 'laser', name: '고에너지 레이저 무기', cat: 'missile', year: 2025, cost: 700, req: ['gan_aesa', 'ai_1'], desc: '드론과 로켓을 저비용으로 요격하는 레이저 방공.', effects: { landDefense: 0.04, navalPower: 0.02 } },
];
