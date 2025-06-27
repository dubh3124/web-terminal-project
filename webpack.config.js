// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/client/client.ts',
  output: {
    filename: 'client.js',
    path: path.resolve(__dirname, 'dist/public'),
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/client/index.html',
      filename: 'index.html',
    }),
    new CopyPlugin({
      patterns: [
        { from: 'src/client/style.css', to: 'style.css' },
      ],
    }),
  ],
  devtool: 'source-map',
};