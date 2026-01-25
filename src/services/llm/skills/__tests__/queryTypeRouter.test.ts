/**
 * Query Type Router Tests
 */

import { describe, test, expect } from 'bun:test';
import { classifyByKeywords } from '../queryTypeRouter';

describe('QueryTypeRouter - Keyword Classification', () => {
  describe('kpi_single (统计单值)', () => {
    test('should classify "订单总数" as kpi_single with high confidence', () => {
      const result = classifyByKeywords('统计订单总数');
      expect(result.queryType).toBe('kpi_single');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.method).toBe('keyword');
    });

    test('should classify "多少个用户" with domain term', () => {
      const result = classifyByKeywords('有多少个用户注册了');
      expect(result.queryType).toBe('kpi_single');
      expect(result.confidence).toBe(1.0); // keyword + domain term
    });

    test('should classify English "total count"', () => {
      const result = classifyByKeywords('What is the total count of orders?');
      expect(result.queryType).toBe('kpi_single');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('trend_time (时间趋势)', () => {
    test('should classify "按天的趋势" as trend_time', () => {
      const result = classifyByKeywords('最近30天按天的订单趋势');
      expect(result.queryType).toBe('trend_time');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('should classify "增长变化"', () => {
      const result = classifyByKeywords('用户数量的增长变化');
      expect(result.queryType).toBe('trend_time');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    test('should classify "monthly trend"', () => {
      const result = classifyByKeywords('Show me the monthly sales trend');
      expect(result.queryType).toBe('trend_time');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('distribution (分布)', () => {
    test('should classify "分布情况" as distribution', () => {
      const result = classifyByKeywords('各地区订单的分布情况');
      expect(result.queryType).toBe('distribution');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    test('should classify "占比"', () => {
      const result = classifyByKeywords('不同商品的销售额占比');
      expect(result.queryType).toBe('distribution');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('topn (排名)', () => {
    test('should classify "前10名" as topn', () => {
      const result = classifyByKeywords('销售额前10名的商品');
      expect(result.queryType).toBe('topn');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('should classify "top 5"', () => {
      const result = classifyByKeywords('Show me top 5 users by revenue');
      expect(result.queryType).toBe('topn');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    test('should classify "最多的"', () => {
      const result = classifyByKeywords('订单最多的用户');
      expect(result.queryType).toBe('topn');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe('comparison (对比)', () => {
    test('should classify "对比" as comparison', () => {
      const result = classifyByKeywords('今年和去年的销售额对比');
      expect(result.queryType).toBe('comparison');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('should classify "A vs B"', () => {
      const result = classifyByKeywords('Compare product A vs product B');
      expect(result.queryType).toBe('comparison');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('kpi_grouped (分组聚合)', () => {
    test('should classify "按地区统计" as kpi_grouped', () => {
      const result = classifyByKeywords('按地区统计订单数量');
      expect(result.queryType).toBe('kpi_grouped');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('should classify "group by"', () => {
      const result = classifyByKeywords('Group sales by category');
      expect(result.queryType).toBe('kpi_grouped');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('unknown (无法分类)', () => {
    test('should return unknown for ambiguous query', () => {
      const result = classifyByKeywords('帮我分析一下');
      expect(result.queryType).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('should return unknown for random text', () => {
      const result = classifyByKeywords('hello world');
      expect(result.queryType).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Confidence levels', () => {
    test('single keyword should give 0.6 confidence', () => {
      const result = classifyByKeywords('趋势');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result.confidence).toBeLessThan(0.8);
    });

    test('multiple keywords should give 0.9 confidence', () => {
      const result = classifyByKeywords('订单趋势变化');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('keyword + domain term should give 1.0 confidence', () => {
      const result = classifyByKeywords('统计订单总数');
      expect(result.confidence).toBe(1.0);
    });
  });
});

describe('QueryTypeRouter - Accuracy Test (20 cases)', () => {
  const testCases: Array<{ input: string; expected: string; description: string }> = [
    // 统计类 (5)
    { input: '总共有多少订单', expected: 'kpi_single', description: '统计总数' },
    { input: '平均订单金额是多少', expected: 'kpi_single', description: '统计平均' },
    { input: 'What is the total revenue', expected: 'kpi_single', description: 'English 统计' },
    { input: '用户数量统计', expected: 'kpi_single', description: '统计数量' },
    { input: 'Count of orders', expected: 'kpi_single', description: 'English count' },

    // 趋势类 (3)
    { input: '最近30天的订单趋势', expected: 'trend_time', description: '时间趋势' },
    { input: '销售额的增长变化', expected: 'trend_time', description: '变化趋势' },
    { input: 'Monthly sales trend', expected: 'trend_time', description: 'English 趋势' },

    // 分布类 (3)
    { input: '各地区的订单分布', expected: 'distribution', description: '分布情况' },
    { input: '不同商品的销售占比', expected: 'distribution', description: '占比分析' },
    { input: 'Distribution by category', expected: 'distribution', description: 'English 分布' },

    // TopN 类 (3)
    { input: '销售额前10名的用户', expected: 'topn', description: 'Top N' },
    { input: 'Top 5 products', expected: 'topn', description: 'English Top N' },
    { input: '订单最多的商品', expected: 'topn', description: '最多排名' },

    // 对比类 (2)
    { input: '今年和去年的销售对比', expected: 'comparison', description: '时间对比' },
    { input: 'Compare A vs B', expected: 'comparison', description: 'English 对比' },

    // 分组聚合 (2)
    { input: '按地区统计订单', expected: 'kpi_grouped', description: '按维度统计' },
    { input: 'Group by category', expected: 'kpi_grouped', description: 'English group by' },

    // 边界情况 (2)
    { input: '分析一下数据', expected: 'unknown', description: '模糊查询' },
    { input: 'Show me the data', expected: 'unknown', description: 'Generic request' }
  ];

  test('should achieve >= 70% accuracy on 20 test cases', () => {
    let correctCount = 0;
    const results: Array<{ input: string; expected: string; actual: string; correct: boolean }> = [];

    for (const testCase of testCases) {
      const result = classifyByKeywords(testCase.input);
      const correct = result.queryType === testCase.expected;
      if (correct) correctCount++;

      results.push({
        input: testCase.input,
        expected: testCase.expected,
        actual: result.queryType,
        correct
      });
    }

    const accuracy = correctCount / testCases.length;
    
    console.log('\n=== Query Type Router Accuracy Test ===');
    console.log(`Total cases: ${testCases.length}`);
    console.log(`Correct: ${correctCount}`);
    console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}%`);
    console.log('\nFailed cases:');
    results.filter(r => !r.correct).forEach(r => {
      console.log(`  - "${r.input}"`);
      console.log(`    Expected: ${r.expected}, Got: ${r.actual}`);
    });

    expect(accuracy).toBeGreaterThanOrEqual(0.7); // 70% threshold
  });
});

describe('QueryTypeRouter - Performance', () => {
  test('keyword classification should complete < 50ms', () => {
    const start = performance.now();
    
    // Run 100 classifications
    for (let i = 0; i < 100; i++) {
      classifyByKeywords('统计最近30天的订单总数按地区分布');
    }
    
    const end = performance.now();
    const avgTime = (end - start) / 100;
    
    console.log(`\nAverage classification time: ${avgTime.toFixed(2)}ms`);
    
    expect(avgTime).toBeLessThan(50);
  });
});
