"use client";

import Header from "@/components/Header";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { getPlanLabel, getPlanColor } from "@/lib/planUI";
import { getLimitByPlan } from "@/lib/planLimits";



export default function ProfilePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [shoppingCount, setShoppingCount] = useState(0);
  const [masterCount, setMasterCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [recipeCount, setRecipeCount] = useState(0);
  const [mealPlanCount, setMealPlanCount] = useState(0);
  const [groupCount, setGroupCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("");

  const [userPlan, setUserPlan] = useState<string>("free");
  const [userRole, setUserRole] = useState<"admin" | "user">("user");
  const [theme, setTheme] = useState("default");
  const [fontSize, setFontSize] = useState("normal");
  const [density, setDensity] = useState("normal");

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const changeFontSize = (size: string) => {
    setFontSize(size);
  
    localStorage.setItem("fontSize", size);
  
    const root = document.documentElement;
  
    const sizes: Record<
  string,
  {
    item: string;
    meta: string;
    button: string;
  }
> = {
  small: {
    item: "13px",
    meta: "11px",
    button: "13px",
  },
  
  normal: {
    item: "14px",
    meta: "12px",
    button: "14px",
  },
  
  large: {
    item: "16px",
    meta: "13px",
    button: "15px",
  },
};
  
    const current = sizes[size] ?? sizes.normal;
  
    root.style.setProperty("--font-item", current.item);
    root.style.setProperty("--font-meta", current.meta);
    root.style.setProperty("--font-button", current.button);
  };

  const changeDensity = (value: string) => {
    setDensity(value);
  
    localStorage.setItem("density", value);
  
    const root = document.documentElement;
  
    const densities = {
      compact: {
        itemPadding: "8px",
        iconSize: "32px",
        itemGap: "8px",
      },
  
      normal: {
        itemPadding: "12px",
        iconSize: "40px",
        itemGap: "12px",
      },
    };
  
    const current =
      densities[value as keyof typeof densities] ??
      densities.normal;
  
    root.style.setProperty(
      "--item-padding",
      current.itemPadding
    );
  
    root.style.setProperty(
      "--icon-size",
      current.iconSize
    );
  
    root.style.setProperty(
      "--item-gap",
      current.itemGap
    );
  };

  const isGoogleUser = provider === "google";

  const fetchProfile = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const userEmail = user.email ?? "";

    setEmail(userEmail);
    setNewEmail(userEmail);
    setDisplayName(
      user.user_metadata?.display_name ?? userEmail.split("@")[0]
    );
    setProvider(user.app_metadata?.provider ?? "email");

    const [
      { count: shopping },
      { count: master },
      { count: history },
      { count: recipes },
      { count: mealPlans },
      ownedGroupsResult,
    ] =
      await Promise.all([
        supabase
          .from("shopping_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("user_item_master")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("deleted_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("recipes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("meal_plans")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("groups")
          .select("id")
          .eq("owner_user_id", user.id),
      ]);

      setShoppingCount(shopping ?? 0);
      setMasterCount(master ?? 0);
      setHistoryCount(history ?? 0);
      setRecipeCount(recipes ?? 0);
      setMealPlanCount(mealPlans ?? 0);
      const ownedGroupIds = (ownedGroupsResult.data ?? []).map((group) => group.id);
      setGroupCount(ownedGroupIds.length);
      if (ownedGroupIds.length > 0) {
        const { count: members } = await supabase
          .from("group_members")
          .select("user_id", { count: "exact", head: true })
          .in("group_id", ownedGroupIds)
          .neq("user_id", user.id);
        setMemberCount(members ?? 0);
      } else {
        setMemberCount(0);
      }
       
      if (user) {
        await supabase.from("profiles").upsert({
          user_id: user.id,
          display_name:
            user.user_metadata?.display_name ??
            user.email?.split("@")[0],
          email: user.email,
        });
      }

      const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("role, plan")
  .eq("user_id", user.id)
  .single();

if (profileError) {
  console.error("プロフィール取得エラー:", profileError);
} else {
  setUserPlan(profile?.plan ?? "free");
  setUserRole(profile?.role ?? "user");
}
      
      setLoading(false);
  };

  const updateDisplayName = async () => {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setMessage("表示名を入力してください");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      data: {
        display_name: trimmedName,
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (user) {
      await supabase.from("profiles").upsert({
        user_id: user.id,
        display_name: trimmedName,
        email: user.email,
      });
    }

    if (error) {
      setMessage("表示名の更新に失敗しました");
      return;
    }

    setMessage("表示名を更新しました");
  };

  const updateEmail = async () => {
    const trimmedEmail = newEmail.trim();

    if (!trimmedEmail) {
      setMessage("メールアドレスを入力してください");
      return;
    }

    if (trimmedEmail === email) {
      setMessage("現在のメールアドレスと同じです");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      email: trimmedEmail,
    });

    if (error) {
      setMessage("メールアドレスの変更に失敗しました");
      return;
    }

    setMessage("確認メールを送信しました。メール内のリンクを確認してください");
  };

  const sendPasswordResetEmail = async () => {
  if (!email) {
    setMessage("メールアドレスを取得できませんでした");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) {
    setMessage("パスワード再設定メールの送信に失敗しました");
    return;
  }

  setMessage("パスワード再設定メールを送信しました");
};

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleWithdraw = async () => {
  const ok = window.confirm(
    "本当に退会しますか？\nアカウントと登録データは削除されます。"
  );

  if (!ok) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setMessage("ログイン情報を取得できませんでした");
    return;
  }

  const response = await fetch("/api/delete-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId: user.id }),
  });

  if (!response.ok) {
    setMessage("退会処理に失敗しました");
    return;
  }

  await supabase.auth.signOut();

router.push("/login?withdraw=1");
};

  useEffect(() => {
    fetchProfile();
  }, []);

 useEffect(() => {
  const savedTheme =
    localStorage.getItem("theme") ?? "default";

  setTheme(savedTheme);

  const handleThemeChange = (
    event: Event
  ) => {
    const customEvent =
      event as CustomEvent<string>;

    setTheme(customEvent.detail);
  };

  window.addEventListener(
    "theme-change",
    handleThemeChange
  );

  return () => {
    window.removeEventListener(
      "theme-change",
      handleThemeChange
    );
  };
}, []);

  useEffect(() => {
    const savedFontSize =
      localStorage.getItem("fontSize") ?? "normal";
  
    setFontSize(savedFontSize);
  }, []);

  return (
    <main
  className={`min-h-screen p-4 ${theme}`}
  style={{
    background:
      theme === "default"
        ? "linear-gradient(to bottom, #f7fee7, #ffffff)"
        : "var(--bg-gradient)",
  }}
>
<div className="mx-auto max-w-xl">
  <Header
    title="マイページ 👤"
    subtitle="My page"
    defaultTheme="lime"
  />

  <div className="mb-5">
    <p className="text-sm leading-relaxed text-neutral-500">
      アカウント情報や利用状況、表示設定を確認できます。
    </p>
  </div>

  {message && (
          <div
          className="mb-4 rounded-2xl px-4 py-3 text-sm font-bold"
          style={{
            backgroundColor:
              theme === "default" ? "#ecfccb" : "var(--sub-bg)",
            color:
              theme === "default" ? "#4d7c0f" : "var(--main-text)",
            border: `1px solid ${
              theme === "default" ? "#d9f99d" : "var(--ring-color)"
            }`,
          }}
        >
          {message}
        </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : (
          
          <div className="space-y-4">
           <section
  className="rounded-2xl bg-white p-4 shadow"
  style={{
    border: `1px solid ${
      theme === "default" ? "#d9f99d" : "var(--ring-color)"
    }`,
  }}
>
              <p className="text-sm font-bold"
style={{
  color:
    theme === "default" ? "#4d7c0f" : "var(--main-text)",
}}>アカウント</p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    表示名
                  </label>
                  <div className="flex gap-2">
                  <input
  value={displayName}
  onChange={(e) => setDisplayName(e.target.value)}
  className="flex-1 rounded-xl border px-3 py-2 text-base outline-none"
  style={{
    borderColor:
      theme === "default" ? "#bef264" : "var(--ring-color)",
  }}
  onFocus={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#84cc16" : "var(--main-color)";
  }}
  onBlur={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#bef264" : "var(--ring-color)";
  }}
/>
                    <button
                      onClick={updateDisplayName}
                      className="rounded-xl px-3 py-2 text-xs font-bold text-white"
style={{
  backgroundColor:
    theme === "default" ? "#84cc16" : "var(--main-color)",
}}
                    >
                      保存
                    </button>
                  </div>
                </div>

                {isGoogleUser ? (
  <div className="rounded-2xl bg-yellow-50 p-3 text-xs text-yellow-700 ring-1 ring-yellow-100">
    Googleアカウントでログイン中のため、
    メールアドレス・パスワードの変更はGoogle側で管理されています。
  </div>
) : (
  <>
    {/* メール変更 */}
    <div>
      <label className="mb-1 block text-xs text-gray-500">
        メールアドレス
      </label>
      <div className="flex gap-2">
      <input
  value={newEmail}
  onChange={(e) => setNewEmail(e.target.value)}
  className="flex-1 rounded-xl border px-3 py-2 text-base text-gray-800 placeholder:text-gray-400 outline-none"
  style={{
    borderColor:
      theme === "default" ? "#bef264" : "var(--ring-color)",
  }}
  onFocus={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#84cc16" : "var(--main-color)";
  }}
  onBlur={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#bef264" : "var(--ring-color)";
  }}
/>
        <button
          onClick={updateEmail}
          className="rounded-xl px-3 py-2 text-xs font-bold text-white"
style={{
  backgroundColor:
    theme === "default" ? "#84cc16" : "var(--main-color)",
}}
          
        >
          変更
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        メール変更には確認メールの承認が必要です。
      </p>
    </div>

    {/* パスワード変更 */}
    <div className="rounded-2xl p-3"
style={{
  backgroundColor:
    theme === "default" ? "#f7fee7" : "var(--sub-bg)",
  border: `1px solid ${
    theme === "default" ? "#d9f99d" : "var(--ring-color)"
  }`,
}}>
      <p className="text-xs text-gray-500">パスワード</p>
      <button
        onClick={sendPasswordResetEmail}
        className="mt-2 rounded-full px-4 py-2 text-xs font-bold text-white"
style={{
  backgroundColor:
    theme === "default" ? "#84cc16" : "var(--main-color)",
}}
      >
        パスワード再設定メールを送る
      </button>
    </div>
  </>
)}

                <div className="rounded-2xl p-3"
style={{
  backgroundColor:
    theme === "default" ? "#f7fee7" : "var(--sub-bg)",
  border: `1px solid ${
    theme === "default" ? "#d9f99d" : "var(--ring-color)"
  }`,
}}>
                  <p className="text-xs text-gray-500">会員状況</p>

<p className={`mt-1 text-sm font-bold ${getPlanColor(userPlan)}`}>
  {getPlanLabel(userPlan)}
</p>

<button
  onClick={() => router.push("/upgrade")}
  className="mt-3 w-full rounded-full px-4 py-3 text-sm font-bold text-white shadow"
  style={{
    backgroundColor:
      theme === "default"
        ? "#7c3aed"
        : "var(--main-color)",
  }}
>
  🌙 プラン詳細を見る
</button>

                 
                </div>
              </div>
            </section>



            <section
  className="rounded-2xl bg-white p-4 shadow"
  style={{
    border: `1px solid ${
      theme === "default" ? "#d9f99d" : "var(--ring-color)"
    }`,
  }}
>
  <p
    className="mb-3 text-sm font-bold"
    style={{
      color: theme === "default" ? "#4d7c0f" : "var(--main-text)",
    }}
  >
    利用状況
  </p>

  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
    <div className="usage-card usage-card--shopping rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500">🛒 買い物リスト</p>
      <p className="usage-card__value mt-1 text-xl font-bold">
        {shoppingCount}件
      </p>
    </div>

    <div className="usage-card usage-card--master rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500">❤️ マイアイテム</p>
      <p className="usage-card__value mt-1 text-lg font-bold">
        {masterCount} / {getLimitByPlan(userRole, userPlan, "master")}件
      </p>
    </div>

    <div className="usage-card usage-card--sharing rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500">👥 共有リスト</p>
      <p className="usage-card__value mt-1 text-lg font-bold">
        {groupCount} / {getLimitByPlan(userRole, userPlan, "group")}件
      </p>
    </div>

    <div className="usage-card usage-card--sharing rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500">👤 共有メンバー</p>
      <p className="usage-card__value mt-1 text-lg font-bold">
        {memberCount}人
      </p>
      <p className="mt-1 text-[10px] text-gray-500">1リスト {getLimitByPlan(userRole, userPlan, "member")}人まで</p>
    </div>

    <div className="usage-card usage-card--recipe rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500">📖 レシピノート</p>
      <p className="usage-card__value mt-1 text-lg font-bold">
        {recipeCount} / {getLimitByPlan(userRole, userPlan, "recipe")}件
      </p>
    </div>

    <div className="usage-card usage-card--meal-plan rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500">🍽 献立リスト</p>
      <p className="usage-card__value mt-1 text-lg font-bold">
        {mealPlanCount} / {getLimitByPlan(userRole, userPlan, "mealPlan")}件
      </p>
    </div>

    <div className="usage-card usage-card--history rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500">📜 購入履歴</p>
      <p className="usage-card__value mt-1 text-xl font-bold">
        {historyCount}件
      </p>
    </div>
  </div>
</section>

<section
  className="rounded-2xl bg-white p-4 shadow"
  style={{
    border: `1px solid ${
      theme === "default" ? "#d9f99d" : "var(--ring-color)"
    }`,
  }}
>
              <p className="text-sm font-bold"
style={{
  color:
    theme === "default" ? "#4d7c0f" : "var(--main-text)",
}}>メニュー</p>

              <div className="space-y-2">
              <button
  onClick={() => router.push("/")}
  className="w-full rounded-full px-4 py-2 text-sm font-bold"
  style={{
    backgroundColor:
      theme === "default" ? "#ecfccb" : "var(--sub-bg)",
    color:
      theme === "default" ? "#4d7c0f" : "var(--main-text)",
  }}
>
  お買い物リストへ戻る
</button>

<button
  onClick={() => router.push("/master")}
  className="w-full rounded-full px-4 py-2 text-sm font-bold"
  style={{
    backgroundColor:
      theme === "default" ? "#fce7f3" : "var(--sub-bg)",
    color:
      theme === "default" ? "#be185d" : "var(--main-text)",
  }}
>
  My items を編集する
</button>

<button
  onClick={() => router.push("/history")}
  className="w-full rounded-full px-4 py-2 text-sm font-bold"
  style={{
    backgroundColor:
      theme === "default" ? "#e0f2fe" : "var(--sub-bg)",
    color:
      theme === "default" ? "#0369a1" : "var(--main-text)",
  }}
>
  購入履歴を見る
</button>
              </div>
            </section>

            <button
  onClick={handleLogout}
  className="w-full rounded-full px-4 py-3 text-sm font-bold text-white shadow"
  style={{
    backgroundColor:
      theme === "default"
        ? "#65a30d"
        : "var(--main-color)",
  }}
>
  ログアウト
</button>

<button
  onClick={handleWithdraw}
  className="w-full rounded-full bg-white px-4 py-3 text-sm font-bold text-red-500 shadow ring-1 ring-red-100"
>
  退会する
</button>

        </div>
      )}
      </div>
    </main>
  );
}
