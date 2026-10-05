// 히스토리 섹션. 따라가는 표면의 세션 기록(browser.history)을 오래된 것부터 보이고, 항목을 누르면
// browser.history.go 로 그 항목을 연다. 현재 항목은 aria-current 로 표시한다.
import { drawList } from "@soksak/plugin-api";

export function mount(root, context) {
  const list = document.createElement("ul");
  list.className = "section-list";
  root.append(list);
  const stop = context.status("browser.history", (history, surface) => {
    if (surface === null) { list.textContent = "브라우저 표면 없음"; return; }
    if (!history?.entries.length) { list.textContent = "기록 없음"; return; }
    // 기록 항목마다 그 단추를 문서에 둔다(core docs/spec/exposure.md). 항목에는 id 가 없으므로 자리와 주소가
    // 같으면 같은 항목이다. 자리가 같아야 browser.history.go 의 index 도 같다.
    drawList(list, history.entries.map((entry, index) => ({ entry, index })), {
      key: ({ entry, index }) => `${index} ${entry.url}`,
      create: ({ entry, index }) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.title = entry.url;
        context.bind(button, "browser.history.go", { index });
        item.append(button);
        return item;
      },
      update: (item, { entry, index }) => {
        const button = item.firstElementChild;
        // 기본값: 기록 제목이 비어 있으면 해당 항목의 주소를 표시한다.
        const text = entry.title || entry.url;
        if (button.textContent !== text) button.textContent = text;
        if (index === history.index) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      },
    });
  });
  return { dispose() { stop(); list.remove(); } };
}
