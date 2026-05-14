import { useState } from "react";
import {
  useListProducts,
  useCreateProduct,
  useListCategories,
  useCreateCategory,
  getListProductsQueryKey,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ProductManager() {
  const queryClient = useQueryClient();
  const { data: products, isLoading } = useListProducts();
  const { data: categories } = useListCategories();
  const createMutation = useCreateProduct();
  const createCategoryMutation = useCreateCategory();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMainCategory, setSelectedMainCategory] = useState<number | "">("");
  const [selectedSubCategory, setSelectedSubCategory] = useState<number | "">("");
  const [showNewMainInput, setShowNewMainInput] = useState(false);
  const [showNewSubInput, setShowNewSubInput] = useState(false);
  const [newMainName, setNewMainName] = useState("");
  const [newSubName, setNewSubName] = useState("");

  const mainCategories = categories?.filter((c) => !c.parentId) || [];
  const subCategories = categories?.filter((c) => c.parentId === selectedMainCategory) || [];

  const getCategoryText = (): string => {
    const main = mainCategories.find((c) => c.id === selectedMainCategory);
    const sub = subCategories.find((c) => c.id === selectedSubCategory);
    if (main && sub) return `${main.name} > ${sub.name}`;
    if (main) return main.name;
    return "";
  };

  const handleCreateMainCategory = () => {
    if (!newMainName.trim()) return;
    createCategoryMutation.mutate(
      { data: { name: newMainName.trim() } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setSelectedMainCategory(data.id);
          setNewMainName("");
          setShowNewMainInput(false);
        },
      }
    );
  };

  const handleCreateSubCategory = () => {
    if (!newSubName.trim() || !selectedMainCategory) return;
    createCategoryMutation.mutate(
      { data: { name: newSubName.trim(), parentId: selectedMainCategory as number } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setSelectedSubCategory(data.id);
          setNewSubName("");
          setShowNewSubInput(false);
        },
      }
    );
  };

  const handleCreate = () => {
    const categoryText = getCategoryText();
    if (!name || !description || !categoryText) return;
    createMutation.mutate(
      { data: { name, description, category: categoryText } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setName("");
          setDescription("");
          setSelectedMainCategory("");
          setSelectedSubCategory("");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-card-foreground">새 제품 등록</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">제품명</label>
              <input
                type="text"
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 루나스토리 실리콘 젖병"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">설명</label>
              <textarea
                className="w-full border border-border rounded-lg px-3 py-2 h-24 resize-none bg-background text-foreground"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="제품에 대한 상세 설명을 입력하세요"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">대분류</label>
                {showNewMainInput ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                      value={newMainName}
                      onChange={(e) => setNewMainName(e.target.value)}
                      placeholder="새 대분류명"
                      autoFocus
                    />
                    <button
                      onClick={handleCreateMainCategory}
                      disabled={createCategoryMutation.isPending}
                      className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
                    >
                      추가
                    </button>
                    <button
                      onClick={() => { setShowNewMainInput(false); setNewMainName(""); }}
                      className="px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <select
                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground"
                    value={selectedMainCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__new__") {
                        setShowNewMainInput(true);
                        return;
                      }
                      setSelectedMainCategory(val ? Number(val) : "");
                      setSelectedSubCategory("");
                    }}
                  >
                    <option value="">대분류 선택</option>
                    {mainCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value="__new__">+ 새 대분류 만들기</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">중분류</label>
                {showNewSubInput ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="새 중분류명"
                      autoFocus
                    />
                    <button
                      onClick={handleCreateSubCategory}
                      disabled={createCategoryMutation.isPending}
                      className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
                    >
                      추가
                    </button>
                    <button
                      onClick={() => { setShowNewSubInput(false); setNewSubName(""); }}
                      className="px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <select
                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground disabled:opacity-50"
                    value={selectedSubCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__new__") {
                        setShowNewSubInput(true);
                        return;
                      }
                      setSelectedSubCategory(val ? Number(val) : "");
                    }}
                    disabled={!selectedMainCategory}
                  >
                    <option value="">중분류 선택 (선택사항)</option>
                    {subCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {selectedMainCategory && (
                      <option value="__new__">+ 새 중분류 만들기</option>
                    )}
                  </select>
                )}
              </div>
            </div>

            {getCategoryText() && (
              <p className="text-xs text-muted-foreground">
                선택된 카테고리: <span className="font-medium text-foreground">{getCategoryText()}</span>
              </p>
            )}

            <button
              onClick={handleCreate}
              disabled={createMutation.isPending || !name || !description || !getCategoryText()}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm disabled:opacity-50"
            >
              {createMutation.isPending ? "등록 중..." : "제품 등록"}
            </button>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-card-foreground mb-4">등록된 제품</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">로딩 중...</p>
          ) : products && products.length > 0 ? (
            <div className="space-y-3">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div>
                    <h3 className="font-medium text-card-foreground">{product.name}</h3>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">#{product.id}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              등록된 제품이 없습니다. 제품을 등록해주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
