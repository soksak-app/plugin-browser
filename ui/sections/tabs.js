// 탭 섹션. core.grid 에서 섹션이 받은 탭(context.surface)을 가진 카드의 브라우저 탭을 보이는 제목과 함께 보이고, 탭을 누르면
// core.tab.select 로 그 탭을 고른다. 활성 탭은 aria-current 로 표시한다.
import { drawList } from "@soksak/plugin-api";

export function mount(root, context) {
  const list = document.createElement("ul");
  list.className = "section-list";
  root.append(list);
  const stop = context.status("core.grid", (grid) => {
    const card = grid?.cards.find((item) => item.tabs.some((tab) => tab.id === context.surface));
    // 기본값: 섹션의 표면이 격자의 어느 카드에도 없으면(표면이 닫히는 중) 보일 탭이 없다.
    const tabs = card?.tabs.filter((tab) => tab.plugin === "browser") ?? [];
    if (!tabs.length) { list.textContent = "브라우저 탭 없음"; return; }
    // 탭마다 그 단추를 문서에 둔다. 격자가 바뀔 때마다 단추를 다시 만들면 누르는 동안의 click 을 잃는다
    // (core docs/spec/exposure.md). 새 탭의 단추만 만들고 제목과 현재 탭 표시는 제자리에서 고친다.
    drawList(list, tabs, {
      key: (tab) => tab.id,
      create: (tab) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        context.bind(button, "core.tab.select", { tab: tab.id });
        item.append(button);
        return item;
      },
      update: (item, tab) => {
        const button = item.firstElementChild;
        // 기본값: core.grid 의 label 은 문서가 알린 제목이며 알리기 전에는 null 이므로 탭 이름을 보인다.
        const text = tab.label ?? tab.title;
        if (button.textContent !== text) button.textContent = text;
        if (tab.id === card.active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      },
    });
  });
  return { dispose() { stop(); list.remove(); } };
}
