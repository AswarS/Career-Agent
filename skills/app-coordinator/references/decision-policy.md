# App Decision Policy

Choose the response medium by the user's outcome, not by topic keywords.

## Strong App indicators

An App is usually justified when at least one of these is central to success:

- state changes must be seen over time, such as an algorithm or process;
- the user must repeatedly act and receive immediate feedback;
- realistic rehearsal or branching consequences matter;
- the user must manipulate constraints to understand causal effects;
- the output is an editable operational artifact such as a plan, board, tracker, or decision workspace;
- behavior during interaction provides evidence the Agent needs for later support.

## App rejection indicators

Prefer a normal response or another artifact when:

- the user asks for a fact, definition, short explanation, recommendation, or static checklist;
- linear prose communicates the result equally well;
- a document, spreadsheet, slide deck, or code change is the actual deliverable;
- interaction would be ornamental rather than outcome-changing;
- required content is too uncertain or unsafe to model;
- the user explicitly requests no App.

## Decision test

Ask internally:

1. What can the user do in the App that they cannot do meaningfully in prose?
2. What immediate feedback changes their next action?
3. What observable completion state proves useful progress?

Choose an App only if all three have concrete answers. An attractive diagram alone is not sufficient.

## Career and education examples

| Request | Decision | Scene/reason |
|---|---|---|
| "解释红黑树旋转，最好能逐步操作" | App | `visualize`; state transitions are the content |
| "红黑树是什么？两句话解释" | No App | concise prose is sufficient |
| "模拟一次前端面试并根据我的选择追问" | App | `simulate`; branching rehearsal matters |
| "给我十道面试题清单" | No App | static list unless practice feedback is requested |
| "帮我排两周求职计划并检查冲突" | App | `workspace`; editable artifact and constraints |
| "给我三条时间管理建议" | No App | no operational loop needed |
| "训练二分边界错误，按表现调整难度" | App | `practice`; attempts and adaptation define value |
