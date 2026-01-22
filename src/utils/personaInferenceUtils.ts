/**
 * Infer user persona from user input based on keywords
 * @param userInput - User's natural language query
 * @returns Inferred persona id or null if cannot infer
 */
export const inferPersonaFromInput = (userInput: string): string | null => {
    const input = userInput.toLowerCase();

    // Data analyst keywords
    const analystKeywords = [
        'sql', 'join', 'group by', 'aggregate', 'correlation', 'regression',
        '聚合', '相关性', '回归', '统计', '方差', '标准差', 'count', 'sum', 'avg'
    ];
    if (analystKeywords.some(keyword => input.includes(keyword))) {
        return 'data_analyst';
    }

    // Business user keywords
    const businessKeywords = [
        'gmv', 'conversion', 'roi', 'repurchase', 'retention', 'funnel', 'growth',
        '转化率', '复购', '留存', '漏斗', '增长', '客单价', 'arpu', '活跃用户'
    ];
    if (businessKeywords.some(keyword => input.includes(keyword))) {
        return 'business_user';
    }

    // Product manager keywords
    const pmKeywords = [
        'user behavior', 'ab test', 'feature usage', 'page visit', 'click rate',
        '用户行为', 'ab测试', '功能使用', '页面访问', '点击率', '用户画像', '路径分析'
    ];
    if (pmKeywords.some(keyword => input.includes(keyword))) {
        return 'product_manager';
    }

    return null; // Cannot infer, use saved or default persona
};