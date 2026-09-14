# Minimal Collection Policy

Collect only information that changes correctness, safety, or the primary interaction loop.

## Blocking fields

Usually blocking:

- the observable outcome is ambiguous;
- audience or ability state changes the content substantially and cannot safely be `unknown`;
- success cannot be measured;
- required content or domain scope is missing;
- the main interaction or completion state is unclear;
- sensitive-data or retention expectations are unclear;
- conflicting constraints cannot both be satisfied.

Usually not blocking:

- colors, typography, card style, shadows, or animation easing;
- exact microcopy;
- desktop spacing choices;
- minor optional controls;
- visual theme when no brand requirement exists.

## Direct questions

Ask at most three questions in one message. Group them around outcomes rather than implementation.

Good:

1. "这个面试模拟主要训练哪项能力：需求澄清、算法表达还是系统设计？"
2. "完成后，你希望用什么表现判断练习有效？"
3. "回答内容是否允许保存在本地，还是只记录评分和行为类别？"

Avoid asking the user to design the UI for the renderer.

## When to use `information-collection`

Invoke the peer `information-collection` Skill when:

- information gathering spans several turns or multiple sources;
- the same user profile will be reused by several downstream Skills;
- sensitive preferences need a dedicated consent workflow;
- the user explicitly asks for a structured intake;
- the coordinating context is insufficient to gather reliably.

The peer returns `multi-agent-information-result/1.0` to `app-coordinator`, not directly to `develop-web-game`. Follow [the shared protocol](../../information-collection/references/information-protocol.md).

When the renderer returns `needs_input`:

1. preserve its `missingSetId` and missing items;
2. create a new correlation `requestId`;
3. call `WebAppLoadSkill` with `skill: "information-collection"`; the loader binds the trusted runtime `userId` and returns the complete instructions into this Agent;
4. pass only the missing paths and permitted sources;
5. merge only matching resolved paths from the collector result;
6. reconstruct and validate the App Brief;
7. load and run the renderer instructions once more in the same Agent.

## Unknown values

Use `unknown` only when the App can safely begin without the answer and can adapt from interaction evidence. Pair it with conservative behavior in `adaptation.allowedResponses`. Never use `unknown` to bypass safety, consent, required content, or completion criteria.
