export default function DisclaimerPage() {
  return (
    <main style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>免責事項</h1>

      <p>本アプリは現在ベータ版として提供しています。</p>

      <p>
        動作の保証はしておらず、予期せぬ不具合やデータの消失が発生する可能性があります。
      </p>

      <p>
        本アプリの利用により生じたいかなる損害についても、責任を負いかねますのであらかじめご了承ください。
      </p>

      <p>また、予告なく仕様の変更・提供の停止を行う場合があります。</p>

      <div style={{ marginTop: "30px" }}>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: "999px",
            background: "#fce7f3",
            color: "#db2777",
            textDecoration: "none",
          }}
        >
          ホームへ
        </a>
      </div>
    </main>
  );
}