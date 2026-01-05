/****************************************************
 * 1. 工具函数：utf8ToBase64、encodeURIComponent 的包装
 ****************************************************/

/**
 * 将字符串按 utf8 编码再转为 Base64 字符串
 * @param {string} str
 * @returns {string}
 */
function utf8ToBase64(str) {
    // 这里演示用 btoa，若有 Node 环境则需用 Buffer.from(str, 'utf8').toString('base64')
    // 并留意是否需要对非拉丁字符做额外处理
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (err) {
      console.error('utf8ToBase64 转换出错: ', err);
      return '';
    }
  }
  
  /**
   * 安全包裹一下浏览器自带的 encodeURIComponent
   * @param {string} str
   * @returns {string}
   */
  function safeEncodeURIComponent(str) {
    return encodeURIComponent(str);
  }
  
  /****************************************************
   * 2. 主函数 parseTemplateAll：先找出 { ... }，再解析表达式并替换
   ****************************************************/
  
  /**
   * 对模板中的 {表达式} 进行解析并替换
   * @param {string} template - 模板字符串，如 'https://example.com/?q={encodeURIComponent(word)}'
   * @param {object} context - 上下文变量，如 { word: 'hello', lang: 'en' }
   * @returns {string} - 替换后的完整 URL/字符串
   */
  function parseTemplateAll(template, context = {}) {
    // 找到所有 { ... } 的部分，然后依次解析
    return template.replace(/\{([^}]+)\}/g, (match, expressionBody) => {
      try {
        // 将表达式解析成一个 AST，然后执行得到结果
        const result = evaluateExpression(expressionBody.trim(), context);
        // 一旦拿到计算结果，就拼回整体字符串
        return result;
      } catch (err) {
        console.error('解析表达式时出错:', expressionBody, err);
        // 出错则返回空字符串，或者你也可以选择保留原样
        return '';
      }
    });
  }
  
  /****************************************************
   * 3. 小型解析器：将表达式解析为 AST，再递归求值
   ****************************************************/
  
  /**
   * 根据简单语法规则对 expression 做词法分析，产出 tokens
   * 主要支持：
   *   1. 字符串字面量（双引号）
   *   2. 上下文变量（如 word, lang）
   *   3. 函数调用：encodeURIComponent(...) / utf8ToBase64(...)
   *   4. 加号 +
   *
   * @param {string} expr
   * @returns {Array} tokens
   */
  function tokenize(expr) {
    // 用正则匹配可能出现的 token
    // - 匹配函数名: encodeURIComponent / utf8ToBase64
    // - 匹配变量名: 由字母、数字、下划线组成
    // - 匹配字符串: "xxx"
    // - 匹配 + 号
    // - 匹配括号 ( )
    // - 其余空白忽略
    const tokenPattern = /\s*([a-zA-Z_][a-zA-Z0-9_]*|\+|\(|\)|"[^"]*")\s*/g;
    let match;
    const tokens = [];
  
    while ((match = tokenPattern.exec(expr)) !== null) {
      tokens.push(match[1]);
    }
  
    return tokens;
  }
  
  /**
   * 主入口：解析表达式字符串 => AST
   * @param {string} expr
   * @returns {object} AST
   */
  function parseExpression(expr) {
    const tokens = tokenize(expr);
    let currentIndex = 0;
  
    // 定义一个内部函数，用于获取当前 token
    function peek() {
      return tokens[currentIndex];
    }
  
    // 下一个 token
    function next() {
      return tokens[currentIndex++];
    }
  
    // 判断当前 token 并前进
    function consume(expected) {
      const token = next();
      if (token !== expected) {
        throw new Error(`期望出现 "${expected}", 但实际是 "${token}"`);
      }
    }
  
    /**
     * grammar:
     * expression := additive
     * additive := primary ( '+' primary )*
     */
    function parseExpressionRule() {
      let node = parsePrimary();
  
      // 可能有多个 + 号进行拼接
      while (peek() === '+') {
        next(); // 跳过 '+'
        const right = parsePrimary();
        node = {
          type: 'BinaryExpression',
          operator: '+',
          left: node,
          right,
        };
      }
  
      return node;
    }
  
    /**
     * primary := functionCall | stringLiteral | variable
     */
    function parsePrimary() {
      const token = peek();
  
      // 函数调用: encodeURIComponent(...) / utf8ToBase64(...)
      if (token === 'encodeURIComponent' || token === 'utf8ToBase64') {
        return parseFunctionCall();
      }
  
      // 字符串字面量: "xxx"
      if (token.startsWith('"')) {
        return parseStringLiteral();
      }
  
      // 变量名: word, lang, ...
      if (/[a-zA-Z_][a-zA-Z0-9_]*/.test(token)) {
        return parseVariable();
      }
  
      throw new Error(`无法解析的 token: ${token}`);
    }
  
    /**
     * 函数调用形式：
     *   functionName '(' expression ')'
     */
    function parseFunctionCall() {
      const funcName = next(); // 取到函数名
      consume('(');           // 下一个应当是 (
      const argExpr = parseExpressionRule(); // 里面可以是嵌套表达式
      consume(')');           // 下一个应当是 )
      return {
        type: 'CallExpression',
        callee: funcName,
        argument: argExpr,
      };
    }
  
    /**
     * 字符串字面量: "xxx"
     */
    function parseStringLiteral() {
      const token = next(); // e.g. "hello"
      // 去掉开头结尾的双引号
      const val = token.slice(1, -1);
      return {
        type: 'StringLiteral',
        value: val,
      };
    }
  
    /**
     * 变量: word, lang, ...
     */
    function parseVariable() {
      const varName = next(); // e.g. word
      return {
        type: 'Identifier',
        name: varName,
      };
    }
  
    // 解析真正的表达式
    const ast = parseExpressionRule();
  
    // 理论上此时应该消耗完全部 token，否则就是多余的内容
    if (currentIndex < tokens.length) {
      throw new Error(`表达式多余的 token 未解析: ${tokens.slice(currentIndex).join(' ')}`);
    }
  
    return ast;
  }
  
  /**
   * 递归执行 AST，得到最终值
   * @param {object} node - AST 节点
   * @param {object} context - 上下文（存放各种变量，如 word, lang）
   * @returns {string}
   */
  function evaluateAST(node, context) {
    switch (node.type) {
      case 'StringLiteral':
        return node.value;
  
      case 'Identifier': {
        // 从 context 中取变量
        const val = context[node.name];
        if (typeof val === 'undefined') {
          throw new Error(`变量 "${node.name}" 未在上下文中定义`);
        }
        return String(val);
      }
  
      case 'CallExpression': {
        const argVal = evaluateAST(node.argument, context);
        switch (node.callee) {
          case 'encodeURIComponent':
            return safeEncodeURIComponent(argVal);
          case 'utf8ToBase64':
            return utf8ToBase64(argVal);
          default:
            throw new Error(`不支持的函数调用: ${node.callee}`);
        }
      }
  
      case 'BinaryExpression': {
        if (node.operator === '+') {
          const leftVal = evaluateAST(node.left, context);
          const rightVal = evaluateAST(node.right, context);
          return String(leftVal) + String(rightVal);
        }
        throw new Error(`不支持的二元运算符: ${node.operator}`);
      }
  
      default:
        throw new Error(`无法执行 AST 节点类型: ${node.type}`);
    }
  }
  
  /**
   * 封装 parse + evaluate
   * @param {string} expression
   * @param {object} context
   * @returns {string}
   */
  function evaluateExpression(expression, context) {
    const ast = parseExpression(expression);
    return evaluateAST(ast, context);
  }
  
//   /****************************************************
//    * 4. 测试示例
//    ****************************************************/
  
//   // 上下文变量
//   const context = {
//     word: 'hello',
//     lang: 'en',
//   };
  
//   // (1) 最常见示例
//   let template1 = 'https://api.frdic.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("QYN" + utf8ToBase64(word))}';
//   let finalUrl1 = parseTemplateAll(template1, context);
//   console.log('示例1 =>', finalUrl1);
//   // 解析过程：
//   //   - utf8ToBase64(word) => "aGVsbG8="
//   //   - "QYN" + "aGVsbG8=" => "QYNaGVsbG8="
//   //   - encodeURIComponent("QYNaGVsbG8=") => "QYNaGVsbG8%3D"
//   // => https://api.frdic.com/api/v2/speech/speakweb?langid=en&txt=QYNaGVsbG8%3D
  
//   // (2) 先 base64 再 encode: {encodeURIComponent(utf8ToBase64(word))}
//   let template2 = 'https://example.com/?txt={encodeURIComponent(utf8ToBase64(word))}';
//   let finalUrl2 = parseTemplateAll(template2, context);
//   console.log('示例2 =>', finalUrl2);
//   // => https://example.com/?txt=aGVsbG8%3D
  
//   // (3) 先 encode 再 base64: {utf8ToBase64(encodeURIComponent(word))}
//   let template3 = 'https://example.com/?txt={utf8ToBase64(encodeURIComponent(word))}';
//   let finalUrl3 = parseTemplateAll(template3, context);
//   console.log('示例3 =>', finalUrl3);
//   // => 若 word = "hello"，encodeURIComponent("hello") => "hello"
//   // => utf8ToBase64("hello") => "aGVsbG8="
//   // => 结果: https://example.com/?txt=aGVsbG8=
  
//   // (4) 加号拼接再 base64： {utf8ToBase64("QYN" + word)}
//   let template4 = 'https://example.com/?txt={utf8ToBase64("QYN" + word)}';
//   let finalUrl4 = parseTemplateAll(template4, context);
//   console.log('示例4 =>', finalUrl4);
//   // => "QYN" + "hello" => "QYNhello"
//   // => base64 => "UVlOaGVsbG8="
  
//   // (5) 更复杂的加号组合： {encodeURIComponent("QYN" + utf8ToBase64(word))}
//   let template5 = 'https://example.com/?txt={encodeURIComponent("QYN" + utf8ToBase64(word))}';
//   let finalUrl5 = parseTemplateAll(template5, context);
//   console.log('示例5 =>', finalUrl5);
//   // => utf8ToBase64("hello") => "aGVsbG8="
//   // => "QYN" + "aGVsbG8=" => "QYNaGVsbG8="
//   // => encodeURIComponent("QYNaGVsbG8=") => "QYNaGVsbG8%3D"
  