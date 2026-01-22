# AI Code Review Guidelines for Data Agent Project

## 1. Performance & Efficiency (性能与效率)

*   **Wasm Performance**: Ensure DuckDB-Wasm operations (e.g., bulk inserts, complex joins) avoid excessive main thread blocking. Suggest using Web Workers for heavy data processing.
*   **UI Optimization**: Check for unnecessary React renders. Prioritize `useMemo`, `useCallback`, and pure components for UI responsiveness.
*   **Bundle Size**: Verify that new dependencies are necessary and tree-shakeable. Keep the final build size optimal for fast browser loading.

## 2. Code Quality & TypeScript (代码质量与 TS)

*   **Strict Typing**: All code must pass strict TypeScript checks (`"strict": true` in tsconfig.json). Avoid `any` unless absolutely necessary (e.g., in some legacy data parsing).
*   **Error Handling**: Implement robust error handling for all data fetching and Wasm operations. Log errors using the established English logging conventions.
*   **Readability**: Adhere to Airbnb or Standard JS style guides. Favor modern syntax over old JavaScript patterns.

## 3. Environment & Compatibility (环境与兼容性)

*   **Bun Compatibility**: Verify all Node.js-specific APIs used are compatible with Bun runtime. Prefer web-standard APIs (Fetch API, Streams API).
*   **Browser Compatibility**: Ensure generated code works across Chrome, Firefox, and Safari (target the last 2 major versions).
*   **Security (COOP/COEP)**: For Wasm projects, confirm necessary HTTP headers are set if shared memory features are used.

## 4. Testing & Verification (测试与验证)

*   **Unit Tests**: Every new feature/bug fix requires accompanying unit tests using Bun's test runner (`bun test`).
*   **Review Goal**: The primary goal of this AI review is to ensure automated test passage and adherence to performance metrics, not just syntax checks.
