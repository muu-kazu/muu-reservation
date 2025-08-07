#1.　Node.jsの公式イメージをベースに指定（バージョンは適宜調整してください）
FROM node:18-alpine

#2. 作業ディレクトリを指定
WORKDIR /app

#3. pacckage.json と package-lock.json(またはyarn.lock)をコピー
COPY package*.json ./

#4. 依存関係をインストール
RUN npm install

#5. ソースコードをすべてコピー
COPY . .

#6. Next.jsをビルド(本番用)
RUN npm run build

#7. Next.jsを本番起動するためのポート設定
EXPOSE 3000

#8. Next.jsの本番サーバー起動コマンド
CMD ["npm", "start"]