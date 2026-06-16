import { describe, it, expect } from 'vitest';
import { geocodeAddress, KOREAN_CITIES } from '@domain/services/koreanGeo';

describe('geocodeAddress — NEIS 주소 → 시·군 좌표', () => {
  it('특별시·광역시: 구(區)가 붙어도 메트로 중심 좌표를 돌려준다', () => {
    const seoul = geocodeAddress('서울특별시 강남구 도곡로 1');
    expect(seoul).toEqual({ lat: 37.5665, lon: 126.978, name: '서울' });

    const busan = geocodeAddress('부산광역시 해운대구 좌동순환로 100');
    expect(busan?.name).toBe('부산');
    expect(busan?.lat).toBe(35.1796);
  });

  it('특별자치시: 세종은 하위 시/군 없이 매칭된다', () => {
    expect(geocodeAddress('세종특별자치시 한누리대로 2130')).toEqual({
      lat: 36.48,
      lon: 127.2553,
      name: '세종',
    });
  });

  it('단축 표기(서울 강남구)도 인식한다', () => {
    expect(geocodeAddress('서울 강남구')?.name).toBe('서울');
  });

  it('도(道): 두 번째 토큰의 시/군을 좌표표에서 찾는다', () => {
    const seongnam = geocodeAddress('경기도 성남시 분당구 불정로 6');
    expect(seongnam).toEqual({ lat: 37.4201, lon: 127.1265, name: '성남' });

    const cheongju = geocodeAddress('충청북도 청주시 흥덕구 1순환로 776');
    expect(cheongju?.name).toBe('청주');
  });

  it('개편 명칭(강원특별자치도·전북특별자치도)도 prefix 로 흡수한다', () => {
    expect(geocodeAddress('강원특별자치도 춘천시 중앙로 1')?.name).toBe('춘천');
    expect(geocodeAddress('전북특별자치도 전주시 완산구 효자로 225')?.name).toBe('전주');
  });

  it('동명이군: region 으로 광주(경기) vs 광주광역시 를 가른다', () => {
    const gjMetro = geocodeAddress('광주광역시 서구 내방로 111');
    expect(gjMetro).toEqual({ lat: 35.1595, lon: 126.8526, name: '광주' });

    const gjGyeonggi = geocodeAddress('경기도 광주시 행정타운로 50');
    // 좌표는 경기 광주, 표시명은 괄호 제거 후 '광주'
    expect(gjGyeonggi).toEqual({ lat: 37.4294, lon: 127.2551, name: '광주' });
    expect(gjGyeonggi?.lat).not.toBe(gjMetro?.lat);
  });

  it('동명이군: 고성(강원) vs 고성(경남)을 도(道)로 가른다', () => {
    const gangwon = geocodeAddress('강원특별자치도 고성군 간성읍 간성로 1');
    expect(gangwon?.lat).toBe(38.3802);

    const gyeongnam = geocodeAddress('경상남도 고성군 고성읍 성내로 130');
    expect(gyeongnam?.lat).toBe(34.9731);
  });

  it('제주: 제주시/서귀포시를 구분한다', () => {
    expect(geocodeAddress('제주특별자치도 서귀포시 중앙로 105')?.name).toBe('서귀포');
    expect(geocodeAddress('제주특별자치도 제주시 문연로 6')?.name).toBe('제주');
  });

  it('시/군을 못 찾으면 도(道) 대표 좌표로 폴백한다', () => {
    // 좌표표에 없는 가상의 시 → 경기도 대표(수원)로 폴백
    const fallback = geocodeAddress('경기도 없는시 어딘가로 1');
    expect(fallback).toEqual({ lat: 37.2636, lon: 127.0286, name: '수원' });
  });

  it('빈 문자열·한국 주소가 아니면 null', () => {
    expect(geocodeAddress('')).toBeNull();
    expect(geocodeAddress('   ')).toBeNull();
    expect(geocodeAddress('Somewhere in California')).toBeNull();
  });

  it('반환 좌표는 KOREAN_CITIES 항목과 정확히 일치(WeatherTab 선택 하이라이트 라운드트립)', () => {
    const p = geocodeAddress('경상남도 창원시 의창구 중앙대로 300');
    const city = KOREAN_CITIES.find((c) => c.lat === p?.lat && c.lon === p?.lon);
    expect(city).toBeDefined();
    expect(city?.region).toBe('경상남도');
  });
});
