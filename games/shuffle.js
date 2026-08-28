// Fisher-Yates 洗牌算法：均匀分布的无偏随机打乱
// 之前多引擎使用的 sort(() => 0.5 - Math.random()) 存在统计偏差，
// 会导致角色分配 / 发牌 / 暗号生成的概率不均匀，本工具统一替换之。
// 返回新数组，不修改原数组。
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { shuffle };
