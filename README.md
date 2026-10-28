# 현대전 전략 시뮬레이션 (Modern Wargame)

하츠 오브 아이언 스타일의 일시정지 가능한 실시간 국가 전략 게임. 2026년 1월 1일 시나리오, 실제 세계지도, 실존 무기 체계.

## 플레이

브라우저에서 바로: https://wargame.kacarong.kr/

## 로컬 실행

```bash
npm install        # 또는 bun install
npm run dev        # http://localhost:5180
npm test           # 시뮬레이션 헤드리스 테스트
npm run build      # dist/ 정적 빌드 (아무 정적 호스팅에 올리면 됨)
```

지도 데이터(`public/data/*.json`)는 커밋되어 있습니다. 다시 만들려면 Natural Earth 원본을 `data-src/`에 받은 뒤
`npm run build:map` (scripts/build-map.mjs 상단 주석 참고).

## 구조

- `src/data/` — 정적 데이터: `equipment.ts`(실존 장비 388종), `tech.ts`(기술 76개), `countries.ts`(상세 32개국 + 동맹)
- `src/sim/` — 시뮬레이션 (UI 없음, 테스트 가능)
  - `init.ts` 시나리오 생성 · `tick.ts` 하루 진행
  - `domestic.ts` 경제/예산/자원/연구/생산/정치/의회 표결/선거
  - `military.ts` 편제 충원, 보급, 이동, 전투, 공중우세, 상륙, 항복·종전
  - `ai.ts` AI (배치, 공세, 연구, 생산, 사단 창설, 원조) · `actions.ts` 플레이어 명령
  - `units.ts` 중대·대대·사단 편제 기준
- `src/ui/` — React 화면 (MapView = canvas 지도)
- `scripts/` — `build-map.mjs` 지도 생성, `bench.ts`/`war.ts`/`divs.ts` 밸런스 점검용 (`bun scripts/war.ts JPN PRK KOR 365`)

## 설계 메모

- 프로빈스: 각 나라 안의 실제 도시를 씨앗으로 한 Voronoi 분할(인구 밀도에 비례해 촘촘하게), 약 5,500개.
- 성장률: 시나리오 기준 성장률은 현실값이고, 정책(인프라·R&D·동원·제재·자원)은 시작 시점 대비 변화량으로만 반영.
- 의회: 정당별 경제/안보 성향 + 여야 + 지지율 + 전쟁지지도로 표결. 평시 군비 확장 법안은 통과가 어렵다.
- 알려진 밸런스 과제: AI 간 러-우 전쟁은 대체로 러시아가 6~10개월 안에 우세해짐.
