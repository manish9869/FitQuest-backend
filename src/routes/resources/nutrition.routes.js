import { Router } from 'express';
import { mountResource } from './_mount.js';

const router = Router();

mountResource(router, 'meals', 'meal_logs');
mountResource(router, 'recipes', 'recipes');
mountResource(router, 'food-items', 'food_items');
mountResource(router, 'grocery-lists', 'grocery_lists');

export default router;
