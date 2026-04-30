"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { categories } from "@/lib/categories";

type ShoppingItem = {
  id: number;
  name: string;
  category: string;
  note: string;
  checked: boolean;
  group_id?: string | null;
  created_at?: string;
  image_url?: string | null;
};

type CandidateItem = {
  name: string;
  yomi?: string;
  category?: string;
  note?: string;
  image_url?: string;
};

type GroupOption = {
  id: string;
  name: string;
};

type GroupMember = {
  user_id: string;
  role: string;
  display_name?: string;
};

type Invitation = {
  id: number;
  email: string;
  status: string;
  created_at: string;
};

const toHiragana = (text: string) => {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
};

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [candidateItems, setCandidateItems] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("その他");
  const [mode, setMode] = useState<"personal" | "group">("personal");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [editGroupName, setEditGroupName] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [ownedGroups, setOwnedGroups] = useState<GroupOption[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("その他");
  const [editNote, setEditNote] = useState("");
  const [userMasterItems, setUserMasterItems] = useState<CandidateItem[]>([]);
  const [displayName, setDisplayName] = useState("");

  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);

  const [isShareManageOpen, setIsShareManageOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
const [inviteMessage, setInviteMessage] = useState("");

const appUrl = "https://my-shopping-list-vxll.vercel.app";

const primaryBtn =
  "rounded-xl px-4 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600";

const successBtn =
  "rounded-xl px-4 py-2 text-sm font-semibold text-white bg-green-500 hover:bg-green-600";

const dangerBtn =
  "rounded-xl px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600";

const currentMember = groupMembers.find((member) => member.user_id === userId);
const isCurrentUserOwner = currentMember?.role === "owner";

const checkInvitations = async (userId: string, email: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: invites, error: inviteError } = await supabase
    .from("invitations")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("status", "pending");

  if (inviteError) {
    console.error("招待チェックエラー:", inviteError);
    return;
  }

  for (const invite of invites || []) {
    const { error: memberError } = await supabase
      .from("group_members")
      .insert([
        {
          group_id: invite.group_id,
          user_id: userId,
          role: "member",
        },
      ]);

    if (memberError && memberError.code !== "23505") {
      console.error("招待からメンバー追加エラー:", memberError);
      continue;
    }

    await supabase
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", invite.id);
  }
};

const cancelInvitation = async (inviteId: number) => {
  const ok = confirm("この招待をキャンセルしますか？");
  if (!ok) return;

  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", inviteId);

  if (error) {
    console.error("招待キャンセルエラー:", error);
    alert("招待のキャンセルに失敗しました");
    return;
  }

  await fetchPendingInvitations();
};

  const handleLogout = async () => {
  await supabase.auth.signOut();
  window.location.href = "/login";
};

useEffect(() => {
  if (!userId) return;

  fetchItems();
  fetchCandidateItems();
  fetchUserMasterItems();
}, [userId, mode, selectedGroupId]);

useEffect(() => {
  if (!userId) return;
  fetchOwnedGroups();
}, [userId]);

useEffect(() => {
  const currentGroup = ownedGroups.find((group) => group.id === selectedGroupId);
  setEditGroupName(currentGroup?.name ?? "");
}, [ownedGroups, selectedGroupId]);

useEffect(() => {
  if (mode !== "group" || !selectedGroupId) {
    setGroupMembers([]);
    setPendingInvitations([]); // ←追加
    return;
  }

  fetchGroupMembers();
  fetchPendingInvitations(); // ←これ追加🔥
}, [mode, selectedGroupId]);

useEffect(() => {
  const checkUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);

    const email = user.email ?? "";

    const name =
      user.user_metadata?.display_name ??
      email.split("@")[0] ??
      "";

    setDisplayName(name);
    setUserEmail(email);

    // 👇 checkUser の中に入れる
    if (email) {
      await supabase.from("profiles").upsert({
        user_id: user.id,
        email: email.toLowerCase(),
        display_name: name,
      });

      await checkInvitations(user.id, email);
    }
  };

  checkUser();
}, [router]);

 const fetchCandidateItems = async () => {
  if (!userId) return;

  const [
    { data: defaultData, error: defaultError },
    { data: userData, error: userError },
  ] = await Promise.all([
    supabase
      .from("item_master")
      .select("name, yomi, category, note, image_url")
      .order("id", { ascending: true }),

    supabase
      .from("user_item_master")
      .select("name, yomi, category")
      .eq("user_id", userId)
      .order("id", { ascending: false }),
  ]);

  console.log("default candidate data:", defaultData);
  console.log("user candidate data:", userData);
  console.log("default candidate error:", defaultError);
  console.log("user candidate error:", userError);

  if (defaultError || userError) {
    console.error("候補取得エラー:", defaultError || userError);
    alert(
      `候補の読み込みに失敗しました: ${
        defaultError?.message || userError?.message
      }`
    );
    return;
  }

  const defaultCandidates: CandidateItem[] = (defaultData || []).map((item) => ({
    name: item.name,
    yomi: item.yomi ?? "",
    category: item.category ?? "その他",
    note: item.note ?? "",
    image_url: (item as any).image_url ?? "🛒", // ←これ🔥
  }));

  const userCandidates: CandidateItem[] = (userData || []).map((item) => ({
  name: item.name,
  yomi: item.yomi ?? item.name,
  category: item.category ?? "その他",
  note: "",
  image_url: (item as any).image_url ?? "🛒", // ←これ🔥
}));

  const merged = [...userCandidates, ...defaultCandidates];

  const uniqueCandidates = Array.from(
    new Map(
      merged.map((item) => [item.name.trim().toLowerCase(), item])
    ).values()
  );

  setCandidateItems(uniqueCandidates);
};

const fetchItems = async () => {
  if (!userId) return;

  if (mode === "group" && !selectedGroupId.trim()) {
    setShoppingItems([]);
    return;
  }

  let query = supabase.from("shopping_items").select("*");

  if (mode === "personal") {
    query = query
      .eq("user_id", userId)
      .is("group_id", null);
  } else {
    query = query.eq("group_id", selectedGroupId.trim());
  }

  const { data, error } = await query
    .order("checked", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("取得エラー:", error);
    alert(`読み込みに失敗しました: ${error.message}`);
    return;
  }

  setShoppingItems(data || []);
};

const fetchUserMasterItems = async () => {
  if (!userId) return;

  const { data, error } = await supabase
    .from("user_item_master")
    .select("name, category")
    .eq("user_id", userId);

  if (error) {
    console.error("ユーザーマスター取得エラー:", error);
    return;
  }

  const formatted: CandidateItem[] = (data || []).map((item) => ({
  name: item.name,
  yomi: item.name,
  category: item.category ?? "その他",
  note: "",
}));

  setUserMasterItems(formatted);
};

const fetchOwnedGroups = async (): Promise<GroupOption[]> => {
  if (!userId) return [];

  const { data: ownerGroups, error: ownerError } = await supabase
    .from("groups")
    .select("id, name")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  console.log("owner groups error:", ownerError);
  if (ownerError) {
    console.error("ownerグループ取得エラー:", ownerError);
    return [];
  }

  console.log("owner groups:", ownerGroups);

  const { data: memberships, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);

  console.log("group memberships error:", membershipError);
  if (membershipError) {
    console.error("group_members取得エラー:", membershipError);
    return [];
  }

  console.log("group memberships:", memberships);

  const memberGroupIds = Array.from(
    new Set((memberships || []).map((row) => row.group_id).filter(Boolean))
  ) as string[];

  let memberGroups: GroupOption[] = [];
  if (memberGroupIds.length > 0) {
    const { data: memberGroupsData, error: memberGroupsError } = await supabase
      .from("groups")
      .select("id, name")
      .in("id", memberGroupIds)
      .order("created_at", { ascending: false });

    console.log("member groups error:", memberGroupsError);
    if (memberGroupsError) {
      console.error("所属グループ詳細取得エラー:", memberGroupsError);
      return [];
    }

    memberGroups = (memberGroupsData || []) as GroupOption[];
  }

  console.log("member groups:", memberGroups);

  const mergedGroups = Array.from(
    new Map([...(ownerGroups || []), ...memberGroups].map((g) => [g.id, g])).values()
  );

  console.log("dropdown groups (merged):", mergedGroups);

  setOwnedGroups(mergedGroups);
  setSelectedGroupId((prev) => {
    if (prev && mergedGroups.some((group) => group.id === prev)) return prev;
    return mergedGroups[0]?.id || "";
  });

  return mergedGroups;
};

const createSharedGroup = async () => {
  if (!userId) {
    alert("ログイン情報を取得できませんでした");
    return;
  }

  const trimmedGroupName = newGroupName.trim();
  if (!trimmedGroupName) {
    alert("グループ名を入力してください");
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    alert("ログイン情報を取得できませんでした");
    return;
  }

  const groupInsertPayload = {
    name: newGroupName,
    owner_user_id: user.id,
    is_personal: false,
  };

  console.log("createSharedGroup user:", user);
  console.log("createSharedGroup user.id:", user.id);
  console.log("createSharedGroup groups insert payload:", groupInsertPayload);

  const { data: createdGroup, error: createGroupError } = await supabase
    .from("groups")
    .insert([groupInsertPayload])
    .select("id, name")
    .single();

  if (createGroupError || !createdGroup) {
    console.error("共有グループ作成エラー:", createGroupError);
    alert(`共有リストの作成に失敗しました: ${createGroupError?.message ?? "unknown error"}`);
    return;
  }

  const { error: memberInsertError } = await supabase
    .from("group_members")
    .insert([
      {
        group_id: createdGroup.id,
        user_id: userId,
        role: "owner",
      },
    ]);

  if (memberInsertError) {
    console.error("group_members登録エラー:", memberInsertError);
    alert(`メンバー登録に失敗しました: ${memberInsertError.message}`);
    return;
  }

  await fetchOwnedGroups();
  setSelectedGroupId(createdGroup.id);
  setMode("group");
  setNewGroupName("");
};

const updateSharedGroupName = async () => {
  if (!selectedGroupId) {
    alert("共有リストを選択してください");
    return;
  }

  const trimmedName = editGroupName.trim();
  if (!trimmedName) {
    alert("共有リスト名を入力してください");
    return;
  }

  const { error } = await supabase
    .from("groups")
    .update({ name: editGroupName })
    .eq("id", selectedGroupId);

  if (error) {
    console.error("共有リスト名更新エラー:", error);
    alert(`共有リスト名の更新に失敗しました: ${error.message}`);
    return;
  }

  const currentGroupId = selectedGroupId;
  const updatedGroups = await fetchOwnedGroups();
  console.log("after update selectedGroupId:", currentGroupId);
  console.log("after update groups:", updatedGroups);
  setSelectedGroupId(currentGroupId);
};

const fetchGroupMembers = async () => {
  if (!selectedGroupId) return;

  const { data: membersData, error: membersError } = await supabase
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", selectedGroupId)
    .order("created_at", { ascending: true });

  if (membersError) {
    console.error("グループメンバー取得エラー:", membersError);
    return;
  }

  const userIds = (membersData || []).map((m) => m.user_id);

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .in("user_id", userIds);

  const formatted = (membersData || []).map((m: any) => {
    const profile = profilesData?.find((p) => p.user_id === m.user_id);

    const name =
      profile?.display_name ??
      profile?.email?.split("@")[0] ??
      `${m.user_id.slice(0, 8)}...`;

    return {
      user_id: m.user_id,
      role: m.role,
      display_name: name,
    };
  });

  setGroupMembers(formatted);
};

const fetchPendingInvitations = async () => {
  if (!selectedGroupId) return;

  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, status, created_at")
    .eq("group_id", selectedGroupId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("招待一覧取得エラー:", error);
    return;
  }

  setPendingInvitations(data || []);
};

const addGroupMember = async () => {
  if (!selectedGroupId) {
    alert("共有リストを選択してください");
    return;
  }

  const email = inviteEmail.trim().toLowerCase();

  if (!email) {
    setInviteMessage("メールアドレスを入力してください");
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .ilike("email", email)
    .maybeSingle();

  if (profileError) {
    console.error("プロフィール検索エラー:", profileError);
    setInviteMessage("検索中にエラーが発生しました");
    return;
  }

  if (profile) {
    const { error } = await supabase.from("group_members").insert([
      {
        group_id: selectedGroupId,
        user_id: profile.user_id,
        role: "member",
      },
    ]);

    if (error) {
      console.error("メンバー追加エラー:", error);

      if (error.code === "23505") {
        setInviteMessage("このユーザーはすでにメンバーです");
      } else {
        setInviteMessage(`メンバー追加に失敗しました: ${error.message}`);
      }

      return;
    }

    setInviteMessage(
      `${profile.display_name ?? profile.email?.split("@")[0] ?? "メンバー"}さんを追加しました`
    );

    await fetchGroupMembers();
  } else {
    
    const { data: invite, error } = await supabase
    .from("invitations")
    .insert([
      {
        email,
        group_id: selectedGroupId,
        invited_by: userId,
        status: "pending",
      },
    ])
    .select()
    .single();
  
  if (error) {
    console.error("招待エラー:", error);
    setInviteMessage(`招待に失敗しました: ${error.message}`);
    return;
  }

  if (!invite?.id) {
    console.error("inviteが不正");
    return;
  }
  
  await supabase.functions.invoke("send-invite-email", {
    body: {
      email,
      inviteId: invite.id,
    },
  });
  
  setInviteMessage(
    "招待しました！相手に招待メールを送信しました"
  );
  
  await fetchPendingInvitations();
  }

  setInviteEmail("");
};

const removeGroupMember = async (targetUserId: string, role: string) => {
  if (!selectedGroupId) {
    alert("共有リストを選択してください");
    return;
  }

  if (role !== "member") {
    alert("ownerは削除できません");
    return;
  }

  const ok = window.confirm("このメンバーを共有リストから削除しますか？");
  if (!ok) return;

  const { data, error } = await supabase
  .from("group_members")
  .delete()
  .eq("group_id", selectedGroupId)
  .eq("user_id", targetUserId)
  .select();

console.log("削除されたメンバー:", data);

  if (error) {
    console.error("メンバー削除エラー:", error);
    alert(`メンバー削除に失敗しました: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    alert("削除対象が見つからないか、削除権限がありません");
    return;
  }

  await fetchGroupMembers();
};

const deleteSharedGroup = async () => {
  if (!selectedGroupId) {
    alert("共有リストを選択してください");
    return;
  }

  const ok = window.confirm(
    "この共有リストを削除しますか？共有リストのメンバー情報も削除されます。"
  );
  if (!ok) return;

  const { error } = await supabase
    .from("groups")
    .delete()
    .eq("id", selectedGroupId);

  if (error) {
    console.error("共有リスト削除エラー:", error);
    alert(`共有リストの削除に失敗しました: ${error.message}`);
    return;
  }

  setSelectedGroupId("");
  setGroupMembers([]);
  await fetchOwnedGroups();
};

const allItems = [...candidateItems, ...userMasterItems];

const uniqueItems = Array.from(
  new Map(
    [...candidateItems, ...userMasterItems].map((item) => [
      item.name,
      item,
    ])
  ).values()
);

const filteredItems = candidateItems.filter((item) => {
  const normalizedSearch = toHiragana(search);
  const normalizedName = toHiragana(item.name);
  const normalizedYomi = toHiragana(item.yomi ?? "");

  return (
    normalizedName.includes(normalizedSearch) ||
    normalizedYomi.includes(normalizedSearch)
  );
});

  const groupedItems = useMemo(() => {
    return categories.map((category) => ({
      category,
      items: shoppingItems.filter((item) => item.category === category),
    }));
  }, [shoppingItems]);

  const addItem = async (item: {
  name: string;
  category: string;
  note: string;
  saveToMaster?: boolean;
  isManual?: boolean;
  image_url?: string;
}) => {
  
  if (!userId) {
    alert("ログイン情報を取得できませんでした");
    return;
  }

  const trimmedName = item.name.trim();
  if (!trimmedName) return;

  const groupIdToSave =
    mode === "group" ? selectedGroupId.trim() || null : null;

  if (mode === "group" && !groupIdToSave) {
    alert("共有リストのgroup_idを入力してください");
    return;
  }

  const alreadyExists = shoppingItems.some(
    (shoppingItem) =>
      shoppingItem.name === trimmedName && !shoppingItem.checked
  );

  if (alreadyExists) {
    alert("すでにリストにあります");
    return;
  }

  let categoryToSave = item.category;

// ① user_item_master を先に確認
const { data: matchedUserMaster, error: userMasterLookupError } = await supabase
  .from("user_item_master")
  .select("category")
  .eq("user_id", userId)
  .eq("name", trimmedName)
  .maybeSingle();

if (userMasterLookupError) {
  console.error("user_item_master検索エラー:", userMasterLookupError);
}

// ② item_master も確認
const { data: matchedMaster, error: masterLookupError } = await supabase
  .from("item_master")
  .select("category")
  .eq("name", trimmedName)
  .maybeSingle();

if (masterLookupError) {
  console.error("item_master検索エラー:", masterLookupError);
}

// 優先順位：自分の候補 → デフォルト候補 → 選択中カテゴリ
if (matchedUserMaster?.category) {
  categoryToSave = matchedUserMaster.category;
} else if (matchedMaster?.category) {
  categoryToSave = matchedMaster.category;
}

  const { data, error } = await supabase
  .from("shopping_items")
  .insert([
    {
      user_id: userId,
      name: trimmedName,
      category: categoryToSave,
      note: item.note,
      checked: false,
      group_id: mode === "group" ? selectedGroupId.trim() : null,
      image_url: item.image_url ?? "🛒",
    },
  ])
  .select()
  .single();

if (error) {
  console.error("追加エラー:", error);
  alert(`保存に失敗しました: ${error.message}`);
  return;
}

setShoppingItems((prev) =>
  [...prev, data].sort((a, b) => {
    if (a.checked !== b.checked) {
      return Number(a.checked) - Number(b.checked);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })
);

  const existsInDefaultMaster = candidateItems.some(
  (masterItem) => masterItem.name === trimmedName
);

if (
  item.isManual &&
  item.saveToMaster !== false &&
  !existsInDefaultMaster
) {
  const { error: masterError } = await supabase
    .from("user_item_master")
    .upsert(
      [
        {
  user_id: userId,
  name: trimmedName,
  yomi: toHiragana(trimmedName),
  category: categoryToSave,
}
      ],
      {
        onConflict: "user_id,name",
      }
    );

  if (masterError) {
    console.error("マスタ保存エラー:", masterError);
  }
}

setSearch("");
};

  const toggleItem = async (id: number, currentChecked: boolean) => {
    const { error } = await supabase
      .from("shopping_items")
      .update({ checked: !currentChecked })
      .eq("id", id);

    if (error) {
      console.error("チェック更新エラー:", error);
      alert(`チェック更新に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
  };

  const deleteItem = async (id: number) => {
    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("削除エラー:", error);
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
  };

  const startEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditNote(item.note);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditCategory("その他");
    setEditNote("");
  };

  const saveEdit = async () => {
    if (editingId === null) return;

    const trimmedName = editName.trim();

    if (!trimmedName) {
      alert("アイテム名を入れてね");
      return;
    }

    const { error } = await supabase
      .from("shopping_items")
      .update({
        name: trimmedName,
        category: editCategory,
        note: editNote,
      })
      .eq("id", editingId);

    if (error) {
      console.error("編集エラー:", error);
      alert(`編集に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
    cancelEdit();
  };

const deleteCheckedItems = async () => {
  if (!userId) {
    alert("ログイン情報がありません");
    return;
  }

  const checkedItems = shoppingItems.filter((item) => item.checked);

  if (checkedItems.length === 0) {
    alert("チェック済みの項目がありません");
    return;
  }

  const confirmed = confirm("チェック済みの項目をまとめて削除する？");
  if (!confirmed) return;

  const historyData = checkedItems.map((item) => ({
    user_id: userId,
    group_id: item.group_id ?? null,
    purchased_by_name: displayName || userEmail.split("@")[0] || "だれか",
    name: item.name,
    category: item.category,
    note: item.note ?? "",
    checked: item.checked,
  }));

  const { data, error: insertError } = await supabase
    .from("deleted_items")
    .insert(historyData)
    .select();

  console.log("履歴保存データ:", historyData);
console.log("履歴保存結果:", data);

if (insertError) {
  console.error("履歴保存エラー:", insertError);
  alert(`履歴の保存に失敗しました: ${insertError.message}`);
  return;
}

  const checkedIds = checkedItems.map((item) => item.id);

  const { error: deleteError } = await supabase
    .from("shopping_items")
    .delete()
    .in("id", checkedIds);

  if (deleteError) {
  console.error("一括削除エラー:", deleteError);
  alert(`一括削除に失敗しました: ${deleteError.message}`);
  return;
}

await fetchItems();

// 🔥古い履歴削除（自分のだけ）
await supabase
  .from("deleted_items")
  .delete()
  .eq("user_id", userId)
  .lt(
    "deleted_at",
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  );
};

  return (
    
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-6">
  <div className="mb-4 flex items-start justify-between gap-4">
    <div>
      <p className="text-sm text-neutral-500">My Shopping List</p>

      <h1 className="text-3xl font-bold text-neutral-900">
        お買い物リスト
      </h1>

      {displayName && (
  <p className="mt-1 text-xs text-neutral-500">
    ログイン中：{displayName}様
  </p>
)}
    </div>

    <button
      onClick={handleLogout}
      className="rounded-xl bg-neutral-200 px-3 py-2 text-sm text-neutral-700"
    >
      ログアウト
    </button>
  </div>

  <div className="mb-4 flex flex-wrap gap-2">

  {/* マイページ：黄緑 */}
  <button
    onClick={() => router.push("/profile")}
    className="rounded-full bg-lime-100 px-3 py-1 text-xs text-lime-700 shadow ring-1 ring-lime-200 hover:bg-lime-200"
  >
    My page 👤
  </button>

  {/* My items：ピンク */}
  <button
    onClick={() => router.push("/master")}
    className="rounded-full bg-pink-100 px-3 py-1 text-xs text-pink-600 shadow ring-1 ring-pink-200 hover:bg-pink-200"
  >
    My items 💖
  </button>

  {/* 履歴：水色 */}
  <button
    onClick={() => router.push("/history")}
    className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-600 shadow ring-1 ring-sky-200 hover:bg-sky-200"
  >
    履歴 🕒
  </button>

  {/* ガイド：オレンジ */}
<button
  onClick={() => router.push("/guide")}
  className="rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-600 shadow ring-1 ring-orange-200 hover:bg-orange-200"
>
  ガイド ❓
</button>

<button
  onClick={() => router.push("/privacy")}
  className="rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-600 shadow ring-1 ring-purple-200 hover:bg-purple-200"
>
  プライバシー 🔐
</button>

</div>

  <p className="mt-2 text-sm text-neutral-600">
    よく使うアイテムを検索して、かんたんに追加できます
    <span className="ml-1 text-xs text-neutral-400">（β版）</span>
  </p>
</header>

<section className="mb-4 space-y-4">

{/* 表示モード */}
<div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
  <p className="mb-2 text-sm font-medium text-neutral-700">
    表示モード
  </p>

  <div className="flex flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={() => setMode("personal")}
      className={`rounded-lg px-3 py-2 text-sm ${
        mode === "personal"
          ? "bg-lime-500 text-white"
          : "bg-neutral-200 text-neutral-700"
      }`}
    >
      個人リスト
    </button>

    <button
      type="button"
      onClick={() => setMode("group")}
      className={`rounded-lg px-3 py-2 text-sm ${
        mode === "group"
          ? "bg-blue-500 text-white"
          : "bg-neutral-200 text-neutral-700"
      }`}
    >
      共有リスト
    </button>

    {mode === "group" && (
      <select
        value={selectedGroupId}
        onChange={(e) => setSelectedGroupId(e.target.value)}
        className="min-w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-gray-800"
      >
        <option value="">グループを選択</option>
        {ownedGroups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    )}
  </div>
</div>

{/* 共有管理 */}
{mode === "group" && (
  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
    <button
      type="button"
      onClick={() => setIsShareManageOpen(!isShareManageOpen)}
      className="flex w-full items-center justify-between text-left"
    >
      <span className="text-xl font-bold text-neutral-800">
        共有リスト管理 ⚙️
      </span>
      <span className="text-sm text-neutral-500">
        {isShareManageOpen ? "閉じる ▲" : "開く ▼"}
      </span>
    </button>

    {isShareManageOpen && (
      <div className="mt-4 space-y-4">
        {/* 新規作成 */}
        <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">新規作成</h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="新しい共有リスト名"
              className="min-w-56 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-base text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button type="button" onClick={createSharedGroup} className="rounded-xl bg-blue-500 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-600">
              作成
            </button>
          </div>
        </div>

        {/* リスト名 */}
        <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">リスト名</h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={editGroupName}
              onChange={(e) => setEditGroupName(e.target.value)}
              placeholder="共有リスト名"
              className="min-w-56 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-base text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <button
  type="button"
  onClick={updateSharedGroupName}
  className={successBtn}
>
  更新
</button>
            {isCurrentUserOwner && (
  <button
  type="button"
  onClick={deleteSharedGroup}
  className={dangerBtn}
>
  削除
</button>
)}
          </div>
        </div>

        {/* メンバー追加 */}
        <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">メンバー追加/招待</h3>
          <div className="flex flex-wrap gap-2">
          <input
  type="email"
  value={inviteEmail}
  onChange={(e) => setInviteEmail(e.target.value)}
  placeholder="メールアドレスを入力"
  className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
/>
            <button type="button" onClick={addGroupMember} className="rounded-xl bg-blue-500 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-600">
              追加
            </button>

            <div className="mt-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
  <p className="font-semibold">招待について</p>

  <p className="mt-1">
    登録済みのユーザーは自動で追加されます。
  </p>

  <p className="mt-1">
    未登録の場合は招待メールが送信され、登録後に参加できます。
  </p>

  <p className="mt-2">
    メールが届かない場合は、招待中の「コピー」から共有してください。
  </p>
</div>

          </div>
        </div>

        {/* メンバー */}
        <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">
            メンバー（{groupMembers.length}）
          </h3>

          {groupMembers.length === 0 ? (
            <p className="text-sm text-neutral-500">メンバーがいません</p>
          ) : (
            <ul className="space-y-2">
              {groupMembers.map((member) => (
                <li
                  key={`${member.user_id}-${member.role}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-3 text-sm text-neutral-700 shadow-sm ring-1 ring-neutral-200"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{member.role === "owner" ? "👑" : "👤"}</span>
                    <span>{member.display_name ?? member.user_id}</span>

                    {member.user_id === userId && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
                        あなた
                      </span>
                    )}
                  </div>

                  {isCurrentUserOwner && member.role === "member" && member.user_id !== userId && (
  <button
    type="button"
    onClick={() => removeGroupMember(member.user_id, member.role)}
    className="text-xs text-red-500 hover:underline"
  >
    削除
  </button>
)}

{!isCurrentUserOwner && member.user_id === userId && member.role === "member" && (
  <button
    type="button"
    onClick={() => removeGroupMember(member.user_id, member.role)}
    className="text-xs text-gray-500 hover:underline"
  >
    退出
  </button>
)}
                </li>
              ))}
            </ul>
          )}

{pendingInvitations.map((invite) => {
  const inviteLink = `${window.location.origin}/login?invite=${invite.id}`;

  return (
    <div key={invite.id} className="px-2 py-2">
  <p className="break-all text-sm text-neutral-800">
    {invite.email}
  </p>

  <div className="mt-1 flex flex-wrap items-center gap-2">
    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs text-yellow-700">
      未参加
    </span>

    <button
      onClick={async () => {
        await navigator.clipboard.writeText(inviteLink);
        alert("招待リンクをコピーしました！");
      }}
      className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-600"
    >
      コピー
    </button>

    {isCurrentUserOwner && (
      <button
        onClick={() => cancelInvitation(invite.id)}
        className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600"
      >
        キャンセル
      </button>
    )}
  </div>
</div>
  );
})}

        </div>
      </div>
    )}
  </div>
)}
</section>

        <div className="mb-4 flex justify-end">
  <button
    onClick={deleteCheckedItems}
    className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white"
  >
    チェック済みを削除
  </button>
</div>

        <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <label className="mb-2 block text-sm font-medium text-neutral-700">
            アイテムを検索
          </label>

          <div className="flex gap-2">
  <input
  type="text"
  placeholder="たまご、牛乳…"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter" && search.trim() !== "") {
      addItem({
        name: search,
        category: selectedCategory,
        note: "",
        saveToMaster: true,
        isManual: true,
      });
    }
  }}
  className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-base text-gray-800 placeholder:text-gray-400 outline-none focus:border-neutral-500"
/>

  <button
    type="button"
    onClick={() => {
      if (!search.trim()) return;

      addItem({
        name: search,
        category: selectedCategory,
        note: "",
        saveToMaster: false,
        isManual: false,
      });
    }}
    className="rounded-xl bg-blue-500 px-4 py-3 text-sm text-white"
  >
    追加
  </button>

</div>

<select
  value={selectedCategory}
  onChange={(e) => setSelectedCategory(e.target.value)}
  className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-2 text-base text-gray-800 outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
>
  {categories.map((cat) => (
    <option key={cat} value={cat}>
      {cat}
    </option>
  ))}
</select>

{search.trim() !== "" && (
  <div className="mt-3">
    {filteredItems.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {filteredItems.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() =>
  addItem({
    name: item.name,
    category: item.category ?? "その他",
    note: item.note ?? "",
    image_url: item.image_url ?? "🛒",
    saveToMaster: false,
    isManual: true,
  })
}
            className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 transition hover:bg-neutral-200"
          >
            {item.name}
          </button>
        ))}
      </div>
    ) : (
      <div className="rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
        <p className="text-sm text-neutral-500">
          該当するアイテムがありません
        </p>

        <button
  type="button"
  onClick={() =>
    addItem({
      name: search,
      category: selectedCategory,
      note: "",
      saveToMaster: true,
      isManual: true,
    })
  }
  className="mt-2 mr-2 rounded-lg bg-blue-500 px-3 py-2 text-base text-white"
>
  「{search}」をMy itemsに追加
</button>

        <button
          type="button"
          onClick={() =>
            addItem({
              name: search,
              category: "一時メモ",
              note: "",
              saveToMaster: false,
              isManual: false,
            })
          }
          className="mt-2 rounded-lg bg-neutral-500 px-3 py-2 text-base text-white"
        >
          「{search}」を一時追加する
        </button>
      </div>
    )}
  </div>
)}
        </section>

        <section className="space-y-4">
  {groupedItems.map(({ category, items }) => (
    <div
      key={category}
      className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200"
    >
      <h2 className="mb-3 text-lg font-semibold text-neutral-800">
        {category}
      </h2>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">まだありません</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-xl border p-3 transition-all duration-300 ease-out motion-reduce:transition-none ${
  item.checked
    ? "border-gray-200 bg-gray-100 scale-[0.99]"
    : "border-neutral-100 bg-white"
}`}
            >
              {editingId === item.id ? (
  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
    <input
      value={editName}
      onChange={(e) => setEditName(e.target.value)}
      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-base text-gray-800 placeholder:text-gray-400 outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
      placeholder="食材名"
    />

    <select
      value={editCategory}
      onChange={(e) => setEditCategory(e.target.value)}
      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-base text-gray-800 outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
    >
      {categories.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </select>

    <input
      value={editNote}
      onChange={(e) => setEditNote(e.target.value)}
      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-base text-gray-800 placeholder:text-gray-400 outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
      placeholder="メモ"
    />

                  <button
                    onClick={saveEdit}
                    className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white"
                  >
                    保存
                  </button>

                  <button
                    onClick={cancelEdit}
                    className="rounded-lg bg-neutral-200 px-3 py-2 text-sm text-neutral-700"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleItem(item.id, item.checked)}
                      className="h-4 w-4"
                    />

                    <div
  className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl transition-all duration-300 ease-out motion-reduce:transition-none ${
    item.checked
      ? "bg-gray-100 opacity-50 scale-95"
      : "bg-lime-50 scale-100"
  }`}
>
  {item.image_url?.startsWith("http") ? (
  <img
    src={item.image_url}
    className="h-8 w-8 object-cover rounded"
  />
) : (
  <span>{item.image_url ?? "🛒"}</span>
)}
</div>

                    <div>
                      <p
                        className={`text-sm font-medium transition-all duration-300 ease-out motion-reduce:transition-none ${
                          item.checked
                            ? "text-neutral-400 line-through opacity-60"
                            : "text-gray-800"
                        }`}
                      >
                        {item.name}
                      </p>

                      {item.note && (
                        <p className="text-xs text-neutral-500">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-blue-500"
                    >
                      編集
                    </button>

                    <button
                      onClick={() => {
                        if (confirm("削除していい？")) {
                          deleteItem(item.id);
                        }
                      }}
                      className="text-red-500"
                    >
                      削除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  ))}
</section>
      </div>
    </main>
  );
}