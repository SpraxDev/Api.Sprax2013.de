import express = require('express');
import morgan = require('morgan');

import { minecraftExpressRouter } from './routes/minecraft';
import { skindbExpressRouter } from './routes/skindb';

export const app = express();
app.disable('x-powered-by');

app.use(morgan('dev')); // DEBUG

app.use('/mc', minecraftExpressRouter);
app.use('/skindb', skindbExpressRouter);