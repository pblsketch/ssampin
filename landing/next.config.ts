import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // 데스크톱 앱(Electron 렌더러)이 cross-origin 으로 fetch 하므로 CORS 허용.
        // release-notes.json 은 쌤핀 앱의 "업데이트 카드" / "설정 > 앱 정보" 에서 사용.
        source: "/release-notes.json",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
